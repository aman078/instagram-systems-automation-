import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { TelegramNotifier } from './telegram.js';
import { InstagramPublisher, uploadToPublicCDN } from './publisher.js';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const telegram = new TelegramNotifier();
  const publisher = new InstagramPublisher();

  if (!telegram.isConfigured()) {
    console.log('\n❌ Telegram is not yet configured in .env!');
    console.log('Please add your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env to start the bot listener.\n');
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('🤖 TELEGRAM CONTROL ROOM ACTIVE & LISTENING ON YOUR PHONE');
  console.log('======================================================\n');
  console.log('Waiting for actions from your Telegram bot...\n');

  // Start listening for inline button taps from your phone
  await telegram.startPolling(async (action, query) => {
    console.log(`\n📲 User triggered action: [${action}]`);

    if (action.startsWith('approve_')) {
      const folderName = action.replace('approve_', '');
      const outputDir = path.join(__dirname, '..', 'output', folderName);
      const captionPath = path.join(outputDir, 'caption.txt');

      // 1. Check local cloud_staged.json
      const cloudStagingPath = path.join(__dirname, '..', 'output', 'cloud_staged.json');
      let cloudRecord = null;
      if (fs.existsSync(cloudStagingPath)) {
        try {
          const db = JSON.parse(fs.readFileSync(cloudStagingPath, 'utf8'));
          cloudRecord = db[folderName];
        } catch(e) {}
      }

      // 2. If not found locally, fetch latest from GitHub repo directly
      if (!cloudRecord) {
        try {
          const rawUrl = 'https://raw.githubusercontent.com/aman078/instagram-systems-automation-/main/output/cloud_staged.json';
          const res = await fetch(rawUrl, { cache: 'no-store' });
          if (res.ok) {
            const db = await res.json();
            cloudRecord = db[folderName];
            if (cloudRecord) {
              // Save locally for future reference
              fs.mkdirSync(path.dirname(cloudStagingPath), { recursive: true });
              fs.writeFileSync(cloudStagingPath, JSON.stringify(db, null, 2), 'utf8');
            }
          }
        } catch (e) {
          console.log('Could not fetch cloud_staged.json from GitHub:', e.message);
        }
      }

      if (!fs.existsSync(outputDir) && !cloudRecord) {
        await telegram.sendMessage(`❌ Could not locate draft data for: ${folderName}\nPlease tap [🔄 Regenerate] to create a fresh one.`);
        return;
      }

      await telegram.sendMessage('🚀 Publishing approved carousel to Instagram...');

      try {
        let result;
        if (cloudRecord && cloudRecord.cdnUrls && cloudRecord.cdnUrls.length) {
          console.log(`Publishing from CDN URLs: ${cloudRecord.cdnUrls.length} images`);
          result = await publisher.publishFromUrls(cloudRecord.cdnUrls, cloudRecord.caption);
        } else {
          const caption = fs.readFileSync(captionPath, 'utf8');
          const files = fs.readdirSync(outputDir)
            .filter(f => f.startsWith('slide_') && f.endsWith('.png'))
            .sort()
            .map(f => path.join(outputDir, f));
          result = await publisher.publishCarousel(files, caption);
        }

        if (result.success) {
          await telegram.sendMessage(`🎉 Post is LIVE on Instagram!\n\nPost ID: ${result.postId}`);
        } else if (result.simulated) {
          await telegram.sendMessage(`✅ Approval recorded!\n\n(Note: Meta Graph API credentials not yet filled in .env, so publishing was safely simulated).`);
        }
      } catch (err) {
        console.error('Publish error:', err);
        await telegram.sendMessage(`⚠️ Failed to publish to Instagram: ${err.message}`);
      }
    } else if (action === 'regenerate' || action === 'generate_command') {
      await telegram.sendMessage('🔄 Cooking a fresh topic with Gemini and rendering slides...');

      try {
        const carouselData = await generateCarouselData();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        const manifestKey = `${timestamp}_${safeTitle}`;
        const outputDir = path.join(__dirname, '..', 'output', manifestKey);

        const files = await renderCarousel(carouselData, outputDir);

        // Stage to CDN
        const cdnUrls = [];
        for (const f of files) {
          const url = await uploadToPublicCDN(f);
          cdnUrls.push(url);
        }

        // Save to cloud_staged.json
        const cloudStagingPath = path.join(__dirname, '..', 'output', 'cloud_staged.json');
        let db = {};
        if (fs.existsSync(cloudStagingPath)) {
          try { db = JSON.parse(fs.readFileSync(cloudStagingPath, 'utf8')); } catch(e) {}
        }
        db[manifestKey] = {
          topic: carouselData.topic,
          caption: carouselData.caption,
          cdnUrls: cdnUrls,
          timestamp: new Date().toISOString()
        };
        fs.mkdirSync(path.dirname(cloudStagingPath), { recursive: true });
        fs.writeFileSync(cloudStagingPath, JSON.stringify(db, null, 2), 'utf8');

        // Dispatch preview
        await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic, manifestKey, cdnUrls);

        // Send action buttons
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Approve & Publish', callback_data: `approve_${manifestKey}` },
              { text: '🔄 Regenerate', callback_data: 'regenerate' }
            ],
            [
              { text: '🗑️ Discard Draft', callback_data: 'discard' }
            ]
          ]
        };

        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `⚡ Action Required: Click below to publish [${carouselData.topic}] to Instagram:`,
            reply_markup: keyboard
          })
        });
      } catch (err) {
        console.error('Regenerate error:', err);
        await telegram.sendMessage(`❌ Error generating new carousel: ${err.message}`);
      }
    } else if (action === 'discard') {
      await telegram.sendMessage('🗑️ Draft discarded. No action taken.');
    }
  });
}

main().catch(err => {
  console.error('Bot listener crashed:', err);
});

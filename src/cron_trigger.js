import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';
import { TelegramNotifier } from './telegram.js';
import { uploadToPublicCDN, InstagramPublisher } from './publisher.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function isAutopilotEnabled() {
  if (process.env.AUTO_PUBLISH === 'true' || process.env.AUTO_PUBLISH === '1') {
    return true;
  }
  const configPath = path.join(__dirname, '..', 'autopilot.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.autopilot === true) return true;
    } catch (e) {}
  }
  return false;
}

async function runScheduledPost() {
  const autopilot = isAutopilotEnabled();
  console.log('\n======================================================');
  console.log(`⏰ [SCHEDULER] Waking up for automated post generation...`);
  console.log(`🤖 Mode: ${autopilot ? '🟢 AUTOPILOT (Auto-Publish ON)' : '🟡 MANUAL APPROVAL (Waiting for Telegram)'}`);
  console.log('======================================================\n');

  const telegram = new TelegramNotifier();
  const publisher = new InstagramPublisher();

  if (!telegram.isConfigured()) {
    console.error('❌ Telegram not configured in .env');
    return;
  }

  try {
    // 1. Let Gemini discover an insightful human systems topic
    console.log('🤖 Brainstorming next systems concept with Gemini...');
    const carouselData = await generateCarouselData();

    // 2. Render the cute parchment slides
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const manifestKey = `${timestamp}_${safeTitle}`;
    const outputDir = path.join(__dirname, '..', 'output', manifestKey);

    console.log(`🎨 Rendering slides to: ${outputDir}`);
    const files = await renderCarousel(carouselData, outputDir);

    // 3. Stage slides immediately to public CDN
    console.log('☁️ Staging slides to CDN...');
    const cdnUrls = [];
    for (const f of files) {
      const url = await uploadToPublicCDN(f);
      cdnUrls.push(url);
    }

    // Save locally and in cloud staging registry
    const cloudStagingPath = path.join(__dirname, '..', 'output', 'cloud_staged.json');
    let db = {};
    if (fs.existsSync(cloudStagingPath)) {
      try { db = JSON.parse(fs.readFileSync(cloudStagingPath, 'utf8')); } catch(e) {}
    }
    db[manifestKey] = {
      topic: carouselData.topic,
      caption: carouselData.caption,
      cdnUrls: cdnUrls,
      timestamp: new Date().toISOString(),
      autopilot: autopilot
    };
    fs.mkdirSync(path.dirname(cloudStagingPath), { recursive: true });
    fs.writeFileSync(cloudStagingPath, JSON.stringify(db, null, 2), 'utf8');

    // 4. If AUTOPILOT is ON, publish directly to Instagram!
    if (autopilot) {
      console.log('🚀 Autopilot active: Publishing directly to Instagram without waiting for approval...');
      try {
        const result = await publisher.publishFromUrls(cdnUrls, carouselData.caption);

        if (result.success) {
          console.log(`🎉 Autopilot successfully published to Instagram! Post ID: ${result.postId}`);

          // Send preview album to Telegram so Aman sees what was posted
          await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic, manifestKey, cdnUrls);

          // Send confirmation notice
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: `🎉 [AUTOPILOT LIVE] Post is LIVE on Instagram!\n\n📌 Topic: ${carouselData.topic}\n🆔 Post ID: ${result.postId}\n🔗 Handle: @systems.thinking.lab\n\n(Autopilot mode is ON: Post was generated and published automatically without waiting for approval).`
            })
          });

          console.log('✅ Autopilot execution complete!\n');
          return;
        } else if (result.simulated) {
          console.log('Publish simulated (credentials not configured).');
        }
      } catch (pubErr) {
        console.error('⚠️ Autopilot direct publish encountered error:', pubErr.message);

        if (pubErr.message.includes('COOLDOWN_ACTIVE')) {
          console.log('Safety cooldown active: Spacing post for later window.');
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: `⏳ [Safety Pacing Active] Generated [${carouselData.topic}].\n\nDirect publishing paused: ${pubErr.message}\n\nDraft is staged safely and will post in the next window without risking an Instagram spam flag.`
            })
          });
        } else {
          console.log('Falling back to Telegram manual approval message...');
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: `⚠️ [Autopilot Notice] Generated [${carouselData.topic}], but direct Instagram publish encountered an error: ${pubErr.message}\n\nFalling back to manual approval below:`
            })
          });
        }
      }
    }

    // 5. Manual Approval Flow (Autopilot is OFF or fallback occurred)
    console.log('📱 Dispatching review draft to Telegram for manual approval...');
    await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic, manifestKey, cdnUrls);

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

    console.log('✅ Scheduled draft dispatched to phone successfully!\n');
  } catch (err) {
    console.error('❌ Scheduler error:', err.message);
  }
}

runScheduledPost();

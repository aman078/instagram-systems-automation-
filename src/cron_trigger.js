import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';
import { TelegramNotifier } from './telegram.js';
import { uploadToPublicCDN } from './publisher.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runScheduledPost() {
  console.log('\n⏰ [SCHEDULER] Waking up for automated post generation...');
  const telegram = new TelegramNotifier();

  if (!telegram.isConfigured()) {
    console.error('❌ Telegram not configured in .env');
    return;
  }

  try {
    // 1. Let Gemini autonomously discover an insightful human systems topic
    console.log('🤖 Brainstorming next systems concept with Gemini...');
    const carouselData = await generateCarouselData();

    // 2. Render the cute parchment slides
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const outputDir = path.join(__dirname, '..', 'output', `${timestamp}_${safeTitle}`);

    console.log(`🎨 Rendering slides to: ${outputDir}`);
    const files = await renderCarousel(carouselData, outputDir);

    // 3. Stage slides immediately to public CDN so approval works from anywhere (Cloud or Local)
    console.log('☁️ Staging slides to CDN...');
    const cdnUrls = [];
    for (const f of files) {
      const url = await uploadToPublicCDN(f);
      cdnUrls.push(url);
    }

    // Save a manifest with CDN urls and caption
    const manifest = {
      topic: carouselData.topic,
      caption: carouselData.caption,
      cdnUrls: cdnUrls
    };

    // Encode a short key for callback
    const manifestKey = `${timestamp}_${safeTitle}`;
    // If running in cloud, save to GitHub repository or public Gist / temporary cache
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    // 4. Dispatch directly to Aman's phone with live 1-click approval buttons
    console.log('📱 Dispatching review draft to Telegram...');
    await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic, manifestKey, cdnUrls);

    // Also send an explicit separate button message so Telegram clients never hide it
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

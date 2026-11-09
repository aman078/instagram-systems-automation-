import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateNewsCarouselData } from './news_generator.js';
import { renderNewsCarousel } from './news_renderer.js';
import { TelegramNotifier } from './telegram.js';
import { uploadToPublicCDN, InstagramPublisher } from './publisher.js';
import { isAutopilotEnabled } from './cron_trigger.js';
import { buildReelFromSlides } from './reel_renderer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runDailyNewsPost() {
  const autopilot = isAutopilotEnabled();
  console.log('\n======================================================');
  console.log('📡 [SYSTEM RADAR] Daily Global News Breakdown Starting...');
  console.log(`🤖 Mode: ${autopilot ? '🟢 AUTOPILOT (Auto-Publish ON)' : '🟡 MANUAL APPROVAL'}`);
  console.log('======================================================\n');

  const telegram = new TelegramNotifier();
  const publisher = new InstagramPublisher();

  if (!telegram.isConfigured()) {
    console.error('❌ Telegram not configured in .env');
    return;
  }

  try {
    // 1. Generate timely news systems breakdown
    console.log('🧠 Querying intelligence engine for global event...');
    const carouselData = await generateNewsCarouselData();

    // 2. Render bold technical broadsheet slides
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const manifestKey = `news_${timestamp}_${safeTitle}`;
    const outputDir = path.join(__dirname, '..', 'output', manifestKey);

    console.log(`🎨 Rendering news slides to: ${outputDir}`);
    const files = await renderNewsCarousel(carouselData, outputDir);

    // 2b. Render 5.5-second vertical looping Reel (1080x1920) for Explore & Reels discovery
    try {
      await buildReelFromSlides(outputDir, true);
    } catch (reelErr) {
      console.warn('⚠️ Reel generation skipped:', reelErr.message);
    }

    // 3. Stage slides to CDN
    console.log('☁️ Staging news slides to CDN...');
    const cdnUrls = [];
    for (const f of files) {
      const url = await uploadToPublicCDN(f);
      cdnUrls.push(url);
    }

    // Save cloud staged record
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
      isNews: true,
      autopilot: autopilot
    };
    fs.mkdirSync(path.dirname(cloudStagingPath), { recursive: true });
    fs.writeFileSync(cloudStagingPath, JSON.stringify(db, null, 2), 'utf8');

    // 4. Autopilot direct publishing to Instagram
    if (autopilot) {
      console.log('🚀 Autopilot active: Publishing news breakdown to Instagram...');
      try {
        const result = await publisher.publishFromUrls(cdnUrls, carouselData.caption);

        if (result.success) {
          console.log(`🎉 News breakdown LIVE on Instagram! Post ID: ${result.postId}`);

          await telegram.sendCarouselPreview(files, carouselData.caption, `📡 NEWS: ${carouselData.topic}`, manifestKey, cdnUrls);

          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: `📡 [SYSTEM RADAR LIVE] Daily Global News Breakdown is LIVE on Instagram!\n\n📌 Story: ${carouselData.topic}\n🆔 Post ID: ${result.postId}\n🔗 Handle: @systems.thinking.lab\n\n(Autopilot mode is ON: Post was decrypted and published automatically).`
            })
          });

          console.log('✅ Daily News Autopilot execution complete!\n');
          return;
        }
      } catch (pubErr) {
        console.error('⚠️ Direct publish error:', pubErr.message);
        if (pubErr.message.includes('COOLDOWN_ACTIVE')) {
          console.log('Safety cooldown active: Spacing news post for later window.');
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: `⏳ [Safety Pacing Active] Decrypted news [${carouselData.topic}].\n\nDirect publishing paused: ${pubErr.message}\n\nDraft is staged safely and will post in the next window without risking an Instagram spam flag.`
            })
          });
        }
      }
    }

    // 5. Fallback or Manual Approval
    console.log('📱 Dispatching news review draft to Telegram...');
    await telegram.sendCarouselPreview(files, carouselData.caption, `📡 NEWS: ${carouselData.topic}`, manifestKey, cdnUrls);

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve & Publish', callback_data: `approve_${manifestKey}` },
          { text: '🔄 Regenerate', callback_data: 'regenerate_news' }
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
        text: `⚡ Action Required: Click below to publish news breakdown [${carouselData.topic}] to Instagram:`,
        reply_markup: keyboard
      })
    });

  } catch (err) {
    console.error('❌ Daily News error:', err.message);
  }
}

runDailyNewsPost();

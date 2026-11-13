import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { TelegramNotifier } from './telegram.js';
import { InstagramPublisher, uploadToPublicCDN } from './publisher.js';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';
import { generateNewsCarouselData } from './news_generator.js';
import { renderNewsCarousel } from './news_renderer.js';
import { buildReelFromSlides } from './reel_renderer.js';
import { buildKineticReel } from './kinetic_reel_renderer.js';
import { generateCommentRadar, formatRadarTelegramMessage } from './comment_radar.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAutopilotState() {
  const configPath = path.join(__dirname, '..', 'autopilot.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return Boolean(cfg.autopilot);
    } catch(e) {}
  }
  return false;
}

function setAutopilotState(enabled) {
  const configPath = path.join(__dirname, '..', 'autopilot.json');
  const data = {
    autopilot: enabled,
    updated_at: new Date().toISOString(),
    updated_by: 'Telegram'
  };
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');

  try {
    const repoDir = path.join(__dirname, '..');
    execSync('git add autopilot.json', { cwd: repoDir });
    execSync(`git commit -m "chore: toggle autopilot mode to ${enabled ? 'ON' : 'OFF'} [skip ci]"`, { cwd: repoDir });
    execSync('git push origin main', { cwd: repoDir });
    console.log(`Synced autopilot=${enabled} to GitHub repository.`);
  } catch (err) {
    console.log('Git sync note:', err.message);
  }
}

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

  await telegram.startPolling(async (action, query) => {
    console.log(`\n📲 User triggered action: [${action}]`);

    // 1. Autopilot Switch Toggles
    if (action === 'toggle_autopilot_on' || action === 'autopilot_command:/autopilot on' || action === 'autopilot_command:autopilot on') {
      setAutopilotState(true);
      await telegram.sendMessage(`🟢 AUTOPILOT ENABLED!\n\nFrom now on, carousels will generate and post directly to Instagram on schedule without needing manual approval.\n\nType /autopilot off anytime to switch back to manual approval.`);
      return;
    }

    if (action === 'toggle_autopilot_off' || action === 'autopilot_command:/autopilot off' || action === 'autopilot_command:autopilot off') {
      setAutopilotState(false);
      await telegram.sendMessage(`🔴 AUTOPILOT DISABLED!\n\nPosts will now wait for your manual approval on Telegram before going live.`);
      return;
    }

    if (action.startsWith('autopilot_command:')) {
      const currentState = getAutopilotState();
      const keyboard = {
        inline_keyboard: [
          [
            { text: currentState ? '🟢 Autopilot is ON' : 'Turn ON 🟢', callback_data: 'toggle_autopilot_on' },
            { text: !currentState ? '🔴 Autopilot is OFF' : 'Turn OFF 🔴', callback_data: 'toggle_autopilot_off' }
          ]
        ]
      };

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: `⚙️ AUTOPILOT SWITCH:\n\nCurrent Status: ${currentState ? '🟢 ON (Direct Auto-Publishing)' : '🔴 OFF (Manual Telegram Approval Required)'}\n\nTap below to flip the switch:`,
          reply_markup: keyboard
        })
      });
      return;
    }

    // 2. Manual Approval & Publishing
    if (action.startsWith('approve_')) {
      const folderName = action.replace('approve_', '');
      const outputDir = path.join(__dirname, '..', 'output', folderName);
      const captionPath = path.join(outputDir, 'caption.txt');

      const cloudStagingPath = path.join(__dirname, '..', 'output', 'cloud_staged.json');
      let cloudRecord = null;
      if (fs.existsSync(cloudStagingPath)) {
        try {
          const db = JSON.parse(fs.readFileSync(cloudStagingPath, 'utf8'));
          cloudRecord = db[folderName];
        } catch(e) {}
      }

      if (!cloudRecord) {
        try {
          const rawUrl = 'https://raw.githubusercontent.com/aman078/instagram-systems-automation-/main/output/cloud_staged.json';
          const res = await fetch(rawUrl, { cache: 'no-store' });
          if (res.ok) {
            const db = await res.json();
            cloudRecord = db[folderName];
            if (cloudRecord) {
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
    }
    // 2b. Manual Reel Publishing (Viral Reach Button Callback)
    else if (action.startsWith('reel_') && !action.includes('command') && !action.includes('cmd')) {
      const folderName = action.replace('reel_', '');
      const outputDir = path.join(__dirname, '..', 'output', folderName);
      const isNews = folderName.startsWith('news_');

      await telegram.sendMessage(`🎬 Preparing 5.5s viral looping Reel for: ${folderName}...`);

      try {
        const reelPath = path.join(outputDir, 'reel.mp4');
        if (!fs.existsSync(reelPath)) {
          await telegram.sendMessage('⚙️ Compiling 1080x1920 MP4 with Ken Burns zoom, faststart & stereo synth...');
          await buildReelFromSlides(outputDir, isNews);
        }

        let caption = '';
        const captionPath = path.join(outputDir, 'caption.txt');
        if (fs.existsSync(captionPath)) {
          caption = fs.readFileSync(captionPath, 'utf8');
        } else {
          const cloudStagingPath = path.join(__dirname, '..', 'output', 'cloud_staged.json');
          if (fs.existsSync(cloudStagingPath)) {
            try {
              const db = JSON.parse(fs.readFileSync(cloudStagingPath, 'utf8'));
              caption = db[folderName]?.caption || '';
            } catch (e) {}
          }
        }

        await telegram.sendMessage('🚀 Uploading Reel directly to Meta edge via rupload & awaiting transcode (5-15s)...');
        const result = await publisher.publishReel(reelPath, caption);

        // Sync to git in background for record
        try {
          const repoDir = path.join(__dirname, '..');
          execSync(`git add -f "output/${folderName}/reel.mp4"`, { cwd: repoDir });
          execSync(`git commit -m "feat: staged reel for ${folderName} [skip ci]"`, { cwd: repoDir });
          execSync(`git push origin main`, { cwd: repoDir });
        } catch (e) {}

        if (result.success) {
          await telegram.sendMessage(`🎉 REEL IS LIVE ON INSTAGRAM!\n\n🆔 Post ID: ${result.postId}\n🔗 Handle: @systems.thinking.lab\n\n(Reel has been pushed into the Reels & Explore algorithm for non-followers!)`);
        } else if (result.simulated) {
          await telegram.sendMessage('✅ Reel approval simulated!');
        }
      } catch (err) {
        console.error('Reel publish error:', err);
        await telegram.sendMessage(`⚠️ Failed to publish Reel: ${err.message}`);
      }
    }
    // 3. AI Comment Radar Command /radar (Top-20 Parasite Strategy)
    else if (action === 'cmd_radar' || action === 'radar_command') {
      await telegram.sendMessage('📡 Scanning top 20 creators with Gemini & drafting golden comments...');
      try {
        const radarItems = await generateCommentRadar(3);
        const htmlMsg = formatRadarTelegramMessage(radarItems);
        await telegram.sendMessage(htmlMsg, {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
      } catch (err) {
        console.error('Radar error:', err);
        await telegram.sendMessage(`❌ Error generating Comment Radar: ${err.message}`);
      }
    }
    // 4. Help & Command Manual /help
    else if (action === 'cmd_help' || action === 'help_command') {
      const helpMsg = `🤖 <b>@systems.thinking.lab Command Center</b>\n\n` +
        `📡 <b>/radar</b> — AI Comment Radar (Top-20 Parasite Strategy with 1-tap copy)\n` +
        `🎬 <b>/reel</b> — Generate fresh viral 5.5s looping vertical Reel\n` +
        `🔄 <b>/generate</b> — Cook a fresh systems thinking carousel draft\n` +
        `🌍 <b>/news</b> — Scan global intelligence & render news breakdown\n` +
        `⚙️ <b>/autopilot</b> — View or toggle auto-publishing on/off\n` +
        `❓ <b>/help</b> — Show this command manual`;
      await telegram.sendMessage(helpMsg, { parse_mode: 'HTML' });
    } 
    // 5. News Breakdown Command /news
    else if (action === 'regenerate_news' || action === 'cmd_news' || action === 'news_command') {
      await telegram.sendMessage('📡 Scanning global intelligence radar with Gemini and rendering breakdown...');

      try {
        const carouselData = await generateNewsCarouselData();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        const manifestKey = `news_${timestamp}_${safeTitle}`;
        const outputDir = path.join(__dirname, '..', 'output', manifestKey);

        const files = await renderNewsCarousel(carouselData, outputDir);

        // Pre-compile 5.5s vertical looping Reel (1080x1920)
        try {
          await buildReelFromSlides(outputDir, true);
        } catch (reelErr) {
          console.warn('⚠️ Reel build note:', reelErr.message);
        }

        const cdnUrls = [];
        for (const f of files) {
          const url = await uploadToPublicCDN(f);
          cdnUrls.push(url);
        }

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
          isNews: true
        };
        fs.mkdirSync(path.dirname(cloudStagingPath), { recursive: true });
        fs.writeFileSync(cloudStagingPath, JSON.stringify(db, null, 2), 'utf8');

        await telegram.sendCarouselPreview(files, carouselData.caption, `📡 NEWS: ${carouselData.topic}`, manifestKey, cdnUrls);

        const keyboard = {
          inline_keyboard: [
            [
              { text: '🎬 Post as Reel (Viral Reach)', callback_data: `reel_${manifestKey}` },
              { text: '📑 Post Carousel', callback_data: `approve_${manifestKey}` }
            ],
            [
              { text: '🔄 Regenerate', callback_data: 'regenerate_news' },
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
        console.error('News generation error:', err);
        await telegram.sendMessage(`❌ Error generating news breakdown: ${err.message}`);
      }
    }
    // 6. Classic Systems Thinking Command /generate or /reel
    else if (action === 'regenerate' || action === 'cmd_generate' || action === 'generate_command' || action === 'cmd_reel' || action === 'reel_command') {
      await telegram.sendMessage('🔄 Cooking a fresh topic with Gemini and compiling both slides & 5.5s Reel...');

      try {
        const carouselData = await generateCarouselData();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        const manifestKey = `${timestamp}_${safeTitle}`;
        const outputDir = path.join(__dirname, '..', 'output', manifestKey);

        const files = await renderCarousel(carouselData, outputDir);

        // Pre-compile Cinematic Reel with Neural Voiceover
        try {
          await buildKineticReel(carouselData, outputDir);
        } catch (reelErr) {
          console.warn('⚠️ Kinetic Reel build note:', reelErr.message);
          try { await buildReelFromSlides(outputDir, false); } catch(e) {}
        }

        const cdnUrls = [];
        for (const f of files) {
          const url = await uploadToPublicCDN(f);
          cdnUrls.push(url);
        }

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

        await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic, manifestKey, cdnUrls);

        const keyboard = {
          inline_keyboard: [
            [
              { text: '🎬 Post as Reel (Viral Reach)', callback_data: `reel_${manifestKey}` },
              { text: '📑 Post Carousel', callback_data: `approve_${manifestKey}` }
            ],
            [
              { text: '🔄 Regenerate', callback_data: 'regenerate' },
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

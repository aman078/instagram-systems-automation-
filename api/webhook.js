import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { TelegramNotifier } from './telegram.js';
import { InstagramPublisher } from './publisher.js';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';
import { uploadToPublicCDN } from './publisher.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Systems Thinking Telegram Webhook Active');
  }

  const telegram = new TelegramNotifier();
  const publisher = new InstagramPublisher();
  const update = req.body;

  try {
    // 1. Handle Button Taps (Approve, Regenerate, Discard)
    if (update.callback_query) {
      const query = update.callback_query;
      const action = query.data;

      // Acknowledge button immediately
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: query.id })
      });

      if (action.startsWith('approve_')) {
        const folderName = action.replace('approve_', '');
        await telegram.sendMessage('🚀 Publishing approved carousel to Instagram...');

        // Fetch cloud-staged data or publish
        const cloudStagingPath = path.join(__dirname, '..', 'output', 'cloud_staged.json');
        let cloudRecord = null;
        if (fs.existsSync(cloudStagingPath)) {
          try { cloudRecord = JSON.parse(fs.readFileSync(cloudStagingPath, 'utf8'))[folderName]; } catch(e) {}
        }

        if (cloudRecord && cloudRecord.cdnUrls) {
          const result = await publisher.publishFromUrls(cloudRecord.cdnUrls, cloudRecord.caption);
          if (result.success) {
            await telegram.sendMessage(`🎉 Post is LIVE on Instagram!\n\nPost ID: ${result.postId}`);
          }
        }
      } else if (action === 'regenerate') {
        // Trigger GitHub Action Workflow Dispatch in the cloud
        await triggerCloudGeneration(telegram);
      } else if (action === 'discard') {
        await telegram.sendMessage('🗑️ Draft discarded.');
      }
    } 
    // 2. Handle Text Commands (/generate)
    else if (update.message && update.message.text) {
      const text = update.message.text.trim().toLowerCase();
      if (text === '/generate' || text === 'generate') {
        await triggerCloudGeneration(telegram);
      }
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }

  return res.status(200).json({ ok: true });
}

async function triggerCloudGeneration(telegram) {
  await telegram.sendMessage('🔄 Cooking a fresh topic in the cloud (GitHub Actions)... Slides arriving in ~25 seconds!');

  // Trigger GitHub Actions workflow dispatch via REST API
  const ghToken = process.env.GITHUB_PAT || process.env.GH_TOKEN;
  if (!ghToken) {
    console.log('No GITHUB_PAT configured. Local generation fallback.');
    return;
  }

  const res = await fetch('https://api.github.com/repos/aman078/instagram-systems-automation-/actions/workflows/scheduled_post.yml/dispatches', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ghToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TelegramBot'
    },
    body: JSON.stringify({ ref: 'main' })
  });

  if (res.status === 204) {
    console.log('Cloud workflow dispatched successfully!');
  } else {
    console.error('Failed to trigger GitHub Action:', await res.text());
  }
}

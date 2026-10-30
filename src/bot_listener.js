import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { TelegramNotifier } from './telegram.js';
import { InstagramPublisher } from './publisher.js';
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
    console.log(`\n📲 User tapped button: [${action}]`);

    if (action.startsWith('approve_')) {
      const folderName = action.replace('approve_', '');
      const outputDir = path.join(__dirname, '..', 'output', folderName);
      const captionPath = path.join(outputDir, 'caption.txt');

      if (!fs.existsSync(outputDir)) {
        await telegram.sendMessage(`❌ Could not locate folder: ${folderName}`);
        return;
      }

      const caption = fs.readFileSync(captionPath, 'utf8');
      const files = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('slide_') && f.endsWith('.png'))
        .sort()
        .map(f => path.join(outputDir, f));

      await telegram.sendMessage('🚀 Publishing approved carousel to Instagram...');

      try {
        const result = await publisher.publishCarousel(files, caption);
        if (result.success) {
          await telegram.sendMessage(`🎉 Post is LIVE on Instagram!\n\nPost ID: ${result.postId}`);
        } else if (result.simulated) {
          await telegram.sendMessage(`✅ Approval recorded!\n\n(Note: Meta Graph API credentials not yet filled in .env, so publishing was safely simulated).`);
        }
      } catch (err) {
        console.error('Publish error:', err);
        await telegram.sendMessage(`⚠️ Failed to publish to Instagram: ${err.message}`);
      }
    } else if (action === 'regenerate') {
      await telegram.sendMessage('🔄 Cooking a fresh topic with Gemini and rendering slides...');

      try {
        const carouselData = await generateCarouselData();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const outputDir = path.join(__dirname, '..', 'output', `${timestamp}_${safeTitle}`);

        const files = await renderCarousel(carouselData, outputDir);
        await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic);
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

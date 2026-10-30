import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';
import { TelegramNotifier } from './telegram.js';

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

    // 3. Dispatch directly to Aman's phone with live 1-click approval buttons
    console.log('📱 Dispatching review draft to Telegram...');
    await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic);
    console.log('✅ Scheduled draft dispatched to phone successfully!\n');
  } catch (err) {
    console.error('❌ Scheduler error:', err.message);
  }
}

runScheduledPost();

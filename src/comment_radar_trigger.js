import dotenv from 'dotenv';
import { TelegramNotifier } from './telegram.js';
import { generateCommentRadar, formatRadarTelegramMessage } from './comment_radar.js';

dotenv.config();

async function runCommentRadarTrigger() {
  console.log('\n======================================================');
  console.log('📡 [RADAR] Generating Top-20 Parasite Strategy Comments...');
  console.log('======================================================\n');

  const telegram = new TelegramNotifier();

  if (!telegram.isConfigured()) {
    console.error('❌ Telegram is not configured in .env');
    process.exit(1);
  }

  try {
    const radarItems = await generateCommentRadar(3);
    const htmlMsg = formatRadarTelegramMessage(radarItems);

    await telegram.sendMessage(htmlMsg, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    console.log('✅ Top-20 Parasite Strategy comments successfully delivered to Telegram!');
  } catch (err) {
    console.error('❌ Failed to run comment radar:', err);
    process.exit(1);
  }
}

runCommentRadarTrigger();

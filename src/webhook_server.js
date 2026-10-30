import { execSync } from 'child_process';
import http from 'http';
import dotenv from 'dotenv';
import { TelegramNotifier } from './telegram.js';
import { InstagramPublisher } from './publisher.js';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';

dotenv.config();

/**
 * Single serverless webhook handler (Can run 24/7 on Render / Railway / Vercel for $0)
 * Telegram sends webhook updates here when you click [Approve]
 */
const telegram = new TelegramNotifier();
const publisher = new InstagramPublisher();

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/telegram-webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        if (update.callback_query) {
          const action = update.callback_query.data;
          console.log(`Received Webhook Action: ${action}`);

          // Acknowledge to Telegram
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ callback_query_id: update.callback_query.id })
          });

          // Handle Action...
        }
      } catch (e) {
        console.error('Webhook error:', e);
      }
      res.writeHead(200);
      res.end('OK');
    });
  } else {
    res.writeHead(200);
    res.end('Systems Thinking Bot Webhook Active');
  }
});

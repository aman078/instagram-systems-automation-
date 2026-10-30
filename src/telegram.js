import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Lightweight Zero-Dependency Telegram Bot Client using native fetch
 */
export class TelegramNotifier {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.apiUrl = `https://api.telegram.org/bot${this.token}`;
  }

  isConfigured() {
    return Boolean(this.token && this.chatId && !this.token.includes('your_') && this.token.length > 10);
  }

  /**
   * Send a simple text message to your phone
   */
  async sendMessage(text) {
    if (!this.isConfigured()) return;
    try {
      await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text
        })
      });
    } catch (e) {
      console.error('Failed to send text message:', e.message);
    }
  }

  /**
   * Send the 5 carousel slides as a media album to your phone
   */
  async sendCarouselPreview(imagePaths, caption, topic, manifestKey = null, cdnUrls = null) {
    if (!this.isConfigured()) {
      console.log('⚠️ Telegram bot not configured in .env. Skipping Telegram push.');
      return null;
    }

    try {
      console.log('📱 Pushing carousel preview to Telegram...');

      // Prepare media group
      const formData = new FormData();
      const media = [];

      for (let i = 0; i < imagePaths.length; i++) {
        const filePath = imagePaths[i];
        const fileBlob = new Blob([fs.readFileSync(filePath)], { type: 'image/png' });
        const fieldName = `photo_${i}`;
        formData.append(fieldName, fileBlob, path.basename(filePath));

        media.push({
          type: 'photo',
          media: `attach://${fieldName}`,
          caption: i === 0 ? `📐 *NEW DRAFT: ${topic}*` : undefined,
          parse_mode: 'Markdown'
        });
      }

      formData.append('chat_id', this.chatId);
      formData.append('media', JSON.stringify(media));

      const albumRes = await fetch(`${this.apiUrl}/sendMediaGroup`, {
        method: 'POST',
        body: formData
      });
      const albumJson = await albumRes.json();

      if (!albumJson.ok) {
        console.error('Telegram sendMediaGroup failed:', albumJson);
      }

      // Send the caption and 1-click action buttons
      const textMessage = `*Post Caption & Hashtags:*\n\n${caption.slice(0, 800)}...\n\n_Review complete. Click an option below:_`;

      // Save a local cloud-staged fallback if manifestKey provided
      const folderRef = manifestKey || path.basename(path.dirname(imagePaths[0]));
      if (cdnUrls && cdnUrls.length) {
        const cloudStagingPath = path.join(__dirname, '..', 'output', 'cloud_staged.json');
        let db = {};
        if (fs.existsSync(cloudStagingPath)) {
          try { db = JSON.parse(fs.readFileSync(cloudStagingPath, 'utf8')); } catch(e) {}
        }
        db[folderRef] = { cdnUrls, caption, topic };
        fs.writeFileSync(cloudStagingPath, JSON.stringify(db, null, 2), 'utf8');
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Approve & Publish', callback_data: `approve_${folderRef}` },
            { text: '🔄 Regenerate', callback_data: 'regenerate' }
          ],
          [
            { text: '🗑️ Discard Draft', callback_data: 'discard' }
          ]
        ]
      };

      const msgRes = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: textMessage,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        })
      });

      const msgJson = await msgRes.json();
      console.log('✅ Telegram preview notification dispatched successfully!');
      return msgJson;
    } catch (err) {
      console.error('Failed to dispatch Telegram message:', err.message);
      return null;
    }
  }

  /**
   * Listen for inline button clicks (long polling loop)
   */
  async startPolling(onAction) {
    if (!this.isConfigured()) return;

    console.log('👂 Telegram bot listening for your 1-click approval...');
    let offset = 0;

    while (true) {
      try {
        const res = await fetch(`${this.apiUrl}/getUpdates?offset=${offset}&timeout=30`);
        const data = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;

            if (update.callback_query) {
              const query = update.callback_query;
              const action = query.data;
              console.log(`\n⚡ Received action from Telegram: ${action}`);

              // Acknowledge the button press
              await fetch(`${this.apiUrl}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callback_query_id: query.id,
                  text: `Action received: ${action}`
                })
              });

              if (onAction) {
                await onAction(action, query);
              }
            }
          }
        }
      } catch (e) {
        console.error('Polling error:', e.message);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export class TelegramNotifier {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  isConfigured() {
    return Boolean(this.botToken && this.chatId && !this.botToken.includes('your_'));
  }

  /**
   * Send a plain text or markdown message
   */
  async sendMessage(text, extraParams = {}) {
    if (!this.isConfigured()) return { simulated: true };

    const res = await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: text,
        ...extraParams
      })
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
    }
    return data;
  }

  /**
   * Send carousel slides as an album (media group)
   */
  async sendCarouselPreview(imageFilePaths, captionText, topic, folderName = '', cdnUrls = [], isPublished = false, postId = null) {
    if (!this.isConfigured()) {
      console.log('Telegram not configured. Preview simulated.');
      return { simulated: true };
    }

    console.log(`📱 Pushing carousel preview to Telegram...`);

    const formData = new FormData();
    const mediaArray = [];

    for (let i = 0; i < imageFilePaths.length; i++) {
      const filePath = imageFilePaths[i];
      const attachName = `slide_${i + 1}`;
      const fileBytes = fs.readFileSync(filePath);
      const blob = new Blob([fileBytes], { type: 'image/png' });

      formData.append(attachName, blob, `slide_${i + 1}.png`);

      const mediaItem = {
        type: 'photo',
        media: `attach://${attachName}`
      };

      if (i === 0) {
        mediaItem.caption = isPublished 
          ? `🎉 LIVE ON INSTAGRAM: ${topic}\n(New Kinetic Video posted to Reels feed. Here are your readable slides below)` 
          : `📐 NEW DRAFT: ${topic}`;
      }

      mediaArray.push(mediaItem);
    }

    formData.append('chat_id', this.chatId);
    formData.append('media', JSON.stringify(mediaArray));

    const albumRes = await fetch(`${this.apiUrl}/sendMediaGroup`, {
      method: 'POST',
      body: formData
    });

    const albumData = await albumRes.json();
    if (!albumData.ok) {
      throw new Error(`Failed to send Telegram media group: ${JSON.stringify(albumData)}`);
    }

    const cleanCaption = (captionText || '').slice(0, 1000);

    if (isPublished) {
      const liveMsg = `🎉 <b>REEL IS LIVE ON INSTAGRAM!</b>\n\n📌 <b>Topic:</b> ${topic}\n🆔 <b>Post ID:</b> ${postId || 'Published'}\n🔗 <b>Instagram:</b> @systems.thinking.lab\n\n📝 <b>Live Caption:</b>\n\n${cleanCaption}\n\n✨ <i>Slides delivered above for your personal reading.</i>`;
      await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: liveMsg,
          parse_mode: 'HTML'
        })
      });
      console.log(`✅ Telegram live post notification with slides dispatched!`);
      return { success: true };
    }

    const captionMsg = `Post Caption & Hashtags:\n\n${cleanCaption}\n\nReview complete. Click an option below:`;

    const isNews = folderName.startsWith('news_');
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚀 Publish Reel to Instagram', callback_data: `reel_${folderName || 'draft'}` },
          { text: '📑 Post Carousel', callback_data: `approve_${folderName || 'draft'}` }
        ],
        [
          { text: '🔄 Regenerate', callback_data: isNews ? 'regenerate_news' : 'regenerate' },
          { text: '🗑️ Discard Draft', callback_data: 'discard' }
        ]
      ]
    };

    await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: captionMsg,
        reply_markup: keyboard
      })
    });

    console.log(`✅ Telegram preview notification dispatched successfully!`);
    return { success: true };
  }

  /**
   * Send compiled video Reel directly to Telegram for instant playback
   */
  async sendReelPreview(videoPath, captionText, topic, folderName = '') {
    if (!this.isConfigured()) {
      console.log('Telegram not configured. Video preview simulated.');
      return { simulated: true };
    }

    console.log(`🎬 Pushing cinematic Reel video preview to Telegram...`);

    const formData = new FormData();
    const fileBytes = fs.readFileSync(videoPath);
    const blob = new Blob([fileBytes], { type: 'video/mp4' });

    formData.append('video', blob, 'reel.mp4');
    formData.append('chat_id', this.chatId);
    formData.append('caption', `🎬 <b>NEW CINEMATIC REEL PREVIEW</b>\n\n📌 <b>Topic:</b> ${topic}\n🎙️ <i>Narrated by Christopher (Neural Voice) + Sub-bass Ambient Bed</i>\n📐 <i>1080x1920 Vertical Full-Screen Canvas</i>\n\nTap play above to preview the video and voiceover.`);
    formData.append('parse_mode', 'HTML');

    const videoRes = await fetch(`${this.apiUrl}/sendVideo`, {
      method: 'POST',
      body: formData
    });

    const videoData = await videoRes.json();
    if (!videoData.ok) {
      console.warn(`Failed to send Telegram video directly: ${JSON.stringify(videoData)}. Falling back to link/message.`);
    }

    const cleanCaption = (captionText || '').slice(0, 1000);
    const captionMsg = `📝 <b>Instagram Caption & Hashtags:</b>\n\n${cleanCaption}\n\nReady to publish to @systems.thinking.lab?`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚀 Publish Reel to Instagram', callback_data: `reel_${folderName || 'draft'}` }
        ],
        [
          { text: '🔄 Regenerate Another Concept', callback_data: 'cmd_reel' },
          { text: '🗑️ Discard Draft', callback_data: 'discard' }
        ]
      ]
    };

    await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: captionMsg,
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
    });

    console.log(`✅ Telegram Reel preview notification dispatched successfully!`);
    return { success: true };
  }

  /**
   * Start long-polling Telegram for button presses & commands
   */
  async startPolling(onAction) {
    if (!this.isConfigured()) return;

    let offset = 0;
    console.log('👂 Telegram bot listening for your 1-click approval & commands...');

    while (true) {
      try {
        const res = await fetch(`${this.apiUrl}/getUpdates?offset=${offset}&timeout=30`, {
          signal: AbortSignal.timeout(45000)
        });
        const data = await res.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;

            if (update.callback_query) {
              const query = update.callback_query;
              const action = query.data;
              console.log(`\n⚡ Received action from Telegram: ${action}`);

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
            } else if (update.message && update.message.text) {
              const text = update.message.text.trim();
              console.log(`\n💬 Received text message from user: "${text}"`);
              const lower = text.toLowerCase();
              if (lower === '/generate' || lower === 'generate') {
                if (onAction) await onAction('cmd_generate', update.message);
              } else if (lower === '/news' || lower === 'news') {
                if (onAction) await onAction('cmd_news', update.message);
              } else if (lower === '/radar' || lower === 'radar') {
                if (onAction) await onAction('cmd_radar', update.message);
              } else if (lower.startsWith('/reel') || lower.startsWith('reel')) {
                if (onAction) await onAction('cmd_reel', update.message);
              } else if (lower === '/help' || lower === 'help' || lower === '/start') {
                if (onAction) await onAction('cmd_help', update.message);
              } else if (lower.startsWith('/autopilot') || lower.startsWith('autopilot')) {
                if (onAction) await onAction(`autopilot_command:${text}`, update.message);
              }
            }
          }
        }
      } catch (e) {
        if (e.name !== 'TimeoutError') {
          console.error('Polling error:', e.message);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
}

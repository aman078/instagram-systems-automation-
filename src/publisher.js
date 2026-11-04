import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, '..', 'publish_log.json');
const MIN_POST_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours safety cooldown

/**
 * Upload local slide to verified CDN (freeimage.host / iili.io)
 * Fully compliant with Meta Graph API image requirements.
 */
export async function uploadToPublicCDN(filePath) {
  const form = new FormData();
  const fileBytes = fs.readFileSync(filePath);
  form.append('image', fileBytes.toString('base64'));

  const res = await fetch('https://freeimage.host/api/1/upload?key=6d207e02198a847aa98d0a2a901485a5', {
    method: 'POST',
    body: form
  });

  const data = await res.json();
  if (!data || !data.image || !data.image.url) {
    throw new Error(`Failed to stage image to CDN: ${JSON.stringify(data)}`);
  }

  return data.image.url;
}

/**
 * Official Meta Instagram Graph API Publisher
 * With automatic anti-spam cooldown protection & rate pacing
 */
export class InstagramPublisher {
  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.accountId = process.env.INSTAGRAM_ACCOUNT_ID;
    this.apiVersion = 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  isConfigured() {
    return Boolean(this.accessToken && this.accountId && !this.accessToken.includes('your_'));
  }

  /**
   * Check if minimum 6 hours have passed since the last post to protect account health
   */
  checkCooldown() {
    if (!fs.existsSync(LOG_FILE)) return { ok: true };
    try {
      const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
      if (Array.isArray(logs) && logs.length > 0) {
        const lastEntry = logs[logs.length - 1];
        const lastTime = new Date(lastEntry.timestamp).getTime();
        const elapsed = Date.now() - lastTime;
        if (elapsed < MIN_POST_INTERVAL_MS) {
          const remainingMinutes = Math.round((MIN_POST_INTERVAL_MS - elapsed) / 60000);
          const hoursAgo = (elapsed / 3600000).toFixed(1);
          return {
            ok: false,
            message: `COOLDOWN_ACTIVE: Previous post was published ${hoursAgo}h ago. Safety cooldown active (${remainingMinutes} mins remaining) to prevent Instagram spam restriction.`
          };
        }
      }
    } catch(e) {}
    return { ok: true };
  }

  recordPublishSuccess(postId, metadata = {}) {
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      try { logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch(e) {}
    }
    logs.push({
      postId,
      timestamp: new Date().toISOString(),
      ...metadata
    });
    // Keep last 50 entries
    if (logs.length > 50) logs = logs.slice(-50);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
  }

  /**
   * Upload an individual slide item container with 2s pace delay
   */
  async createItemContainer(imageUrl) {
    const url = `${this.baseUrl}/${this.accountId}/media`;
    const params = new URLSearchParams({
      image_url: imageUrl,
      is_carousel_item: 'true',
      access_token: this.accessToken
    });

    const res = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
    const data = await res.json();

    if (!data.id) {
      throw new Error(`Failed to create item container: ${JSON.stringify(data)}`);
    }

    return data.id;
  }

  /**
   * Publish a complete multi-slide carousel using already staged CDN urls
   */
  async publishFromUrls(publicUrls, caption, options = {}) {
    if (!this.isConfigured()) {
      return { simulated: true };
    }

    // Safety Cooldown Check (unless force flag passed)
    if (!options.force) {
      const cooldown = this.checkCooldown();
      if (!cooldown.ok) {
        throw new Error(cooldown.message);
      }
    }

    console.log(`📦 Creating Meta carousel item containers for ${publicUrls.length} slides with safety pacing...`);
    const itemIds = [];
    for (const url of publicUrls) {
      const itemId = await this.createItemContainer(url);
      itemIds.push(itemId);
      console.log(`   Container created: ${itemId}`);
      // Pace each slide creation by 1.5 seconds to prevent rate spikes
      await new Promise(r => setTimeout(r, 1500));
    }

    const carouselUrl = `${this.baseUrl}/${this.accountId}/media`;
    const carouselParams = new URLSearchParams({
      media_type: 'CAROUSEL',
      children: itemIds.join(','),
      caption: caption,
      access_token: this.accessToken
    });

    const carouselRes = await fetch(`${carouselUrl}?${carouselParams.toString()}`, { method: 'POST' });
    const carouselData = await carouselRes.json();

    if (!carouselData.id) {
      throw new Error(`Failed to create carousel container: ${JSON.stringify(carouselData)}`);
    }

    const creationId = carouselData.id;
    console.log(`Master Carousel Container Created: ${creationId}`);

    // Wait 4 seconds for Meta media transcode
    await new Promise(r => setTimeout(r, 4000));

    const publishUrl = `${this.baseUrl}/${this.accountId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: this.accessToken
    });

    const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: 'POST' });
    const publishData = await publishRes.json();

    if (!publishData.id) {
      throw new Error(`Failed to publish carousel: ${JSON.stringify(publishData)}`);
    }

    console.log(`🎉 POST PUBLISHED LIVE ON INSTAGRAM! Post ID: ${publishData.id}`);
    this.recordPublishSuccess(publishData.id, { slidesCount: publicUrls.length });
    return { success: true, postId: publishData.id };
  }

  /**
   * Publish a complete multi-slide carousel from local paths
   */
  async publishCarousel(localImagePaths, caption, options = {}) {
    const publicUrls = [];
    for (const p of localImagePaths) {
      publicUrls.push(await uploadToPublicCDN(p));
    }
    return this.publishFromUrls(publicUrls, caption, options);
  }
}

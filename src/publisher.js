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

  /**
   * Publish an Instagram Reel video using Direct Resumable Binary Upload (rupload.facebook.com)
   * or public video_url fallback.
   * Completely avoids external crawler drops, MIME issues, and error 2207076.
   */
  async publishReel(videoTarget, caption, options = {}) {
    if (!this.isConfigured()) {
      return { simulated: true, type: 'REEL' };
    }

    // Safety Cooldown Check (unless force flag passed)
    if (!options.force) {
      const cooldown = this.checkCooldown();
      if (!cooldown.ok) {
        throw new Error(cooldown.message);
      }
    }

    const isLocalFile = fs.existsSync(videoTarget);
    let containerId = null;

    if (isLocalFile) {
      const fileBuffer = fs.readFileSync(videoTarget);
      console.log(`🎬 Initializing Direct Resumable Reel container (${fileBuffer.length} bytes)...`);

      // 1. Initialize session on graph.facebook.com
      const initUrl = `${this.baseUrl}/${this.accountId}/media`;
      const initRes = await fetch(initUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          upload_type: 'resumable',
          media_type: 'REELS',
          caption: caption,
          share_to_feed: 'true',
          access_token: this.accessToken
        })
      });

      const initData = await initRes.json();
      if (!initData.id) {
        throw new Error(`Failed to initialize Reel container: ${JSON.stringify(initData)}`);
      }

      containerId = initData.id;
      const uploadUri = initData.uri || `https://rupload.facebook.com/ig-api-upload/${this.apiVersion}/${containerId}`;
      console.log(`🎬 Reel container created: ${containerId}. Pushing binary directly to Meta edge...`);

      // 2. Upload raw binary directly to Meta's rupload host
      const uploadRes = await fetch(uploadUri, {
        method: 'POST',
        headers: {
          'Authorization': `OAuth ${this.accessToken}`,
          'offset': '0',
          'file_size': String(fileBuffer.length),
          'Content-Type': 'application/octet-stream'
        },
        body: fileBuffer
      });

      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        throw new Error(`Direct binary upload to rupload failed: ${JSON.stringify(uploadData)}`);
      }

      console.log(`✅ Binary uploaded successfully to Meta edge (${fileBuffer.length} bytes). Polling transcode...`);
    } else {
      console.log(`🎬 Creating Meta Reel container for remote video: ${videoTarget}`);
      const reelUrl = `${this.baseUrl}/${this.accountId}/media`;
      const reelParams = new URLSearchParams({
        media_type: 'REELS',
        video_url: videoTarget,
        caption: caption,
        share_to_feed: 'true',
        access_token: this.accessToken
      });

      const res = await fetch(`${reelUrl}?${reelParams.toString()}`, { method: 'POST' });
      const data = await res.json();

      if (!data.id) {
        throw new Error(`Failed to create reel container: ${JSON.stringify(data)}`);
      }

      containerId = data.id;
    }

    // 3. Poll status until transcode is complete
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 25;

    while (!isReady && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 4000));
      attempts++;

      const checkUrl = `${this.baseUrl}/${containerId}?fields=status_code,status&access_token=${this.accessToken}`;
      const checkRes = await fetch(checkUrl);
      const checkData = await checkRes.json();

      const statusCode = checkData.status_code || checkData.status || 'UNKNOWN';
      console.log(`   Transcode poll [${attempts}/${maxAttempts}]: ${statusCode}`);

      if (statusCode === 'FINISHED') {
        isReady = true;
        break;
      }
      if (statusCode === 'ERROR') {
        const errorMsg = JSON.stringify(checkData);
        if (options.retryCount === undefined) options.retryCount = 0;
        if (options.retryCount < 2) {
          console.log(`⚠️ Meta transcode returned transient error (${statusCode}). Retrying with fresh upload in 8s (attempt ${options.retryCount + 1}/2)...`);
          await new Promise(r => setTimeout(r, 8000));
          return this.publishReel(videoTarget, caption, { ...options, retryCount: options.retryCount + 1, force: true });
        }
        throw new Error(`Meta video processing failed: ${errorMsg}`);
      }
      if (statusCode === 'EXPIRED') {
        throw new Error(`Meta reel container expired: ${JSON.stringify(checkData)}`);
      }
    }

    if (!isReady) {
      throw new Error('Meta video processing timed out after waiting.');
    }

    console.log(`🚀 Publishing Reel ${containerId} live to Instagram feed & reels tab...`);
    const publishUrl = `${this.baseUrl}/${this.accountId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: this.accessToken
    });

    const pubRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: 'POST' });
    const pubData = await pubRes.json();

    if (!pubData.id) {
      throw new Error(`Failed to publish reel: ${JSON.stringify(pubData)}`);
    }

    console.log(`🎉 REEL IS LIVE ON INSTAGRAM! Post ID: ${pubData.id}`);
    this.recordPublishSuccess(pubData.id, { type: 'REEL' });
    return { success: true, postId: pubData.id, type: 'REEL' };
  }
}

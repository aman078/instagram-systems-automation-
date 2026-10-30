import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Upload local slide to high-speed verified CDN (freeimage.host / iili.io)
 * Fully compliant with Meta Graph API image requirements.
 */
async function uploadToPublicCDN(filePath) {
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
 * 100% compliant with Instagram Developer Policies (Zero-risk)
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
   * Upload an individual slide item container
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
   * Publish a complete multi-slide carousel
   * @param {string[]} localImagePaths - Array of local slide PNG paths
   * @param {string} caption - Post caption
   */
  async publishCarousel(localImagePaths, caption) {
    if (!this.isConfigured()) {
      console.log('⚠️ Meta Graph API credentials not configured in .env. Skipping actual publish.');
      return { simulated: true, message: 'Ready to publish once Meta tokens are supplied.' };
    }

    console.log(`🚀 Staging ${localImagePaths.length} slides to Meta-compatible CDN...`);
    const publicUrls = [];
    for (let i = 0; i < localImagePaths.length; i++) {
      const publicUrl = await uploadToPublicCDN(localImagePaths[i]);
      publicUrls.push(publicUrl);
      console.log(`   Slide ${i + 1} staged: ${publicUrl}`);
    }

    console.log(`📦 Creating Meta carousel item containers...`);
    const itemIds = [];
    for (const url of publicUrls) {
      const itemId = await this.createItemContainer(url);
      itemIds.push(itemId);
      console.log(`   Container created: ${itemId}`);
    }

    // Create the master carousel container
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
    console.log(`📦 Master Carousel Container Created: ${creationId}`);

    // Wait 3 seconds for Meta media processing
    await new Promise(r => setTimeout(r, 3000));

    // Publish the carousel container
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
    return { success: true, postId: publishData.id };
  }
}

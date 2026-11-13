import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { generateVoiceover } from './voice_generator.js';
import { getFFmpegPath } from './reel_renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Builds a cinematic 1080x1920 vertical Reel with:
 * 1. Native full-screen 9:16 dark luxury typography
 * 2. Deep neural voiceover narration (Edge-TTS Christopher)
 * 3. Cinematic Ken Burns zoom & ambient soundbed
 *
 * @param {Object} carouselData The structured concept data from generator.js
 * @param {string} outputDir The destination folder for assets and reel.mp4
 * @returns {Promise<string>} The path to the generated reel.mp4
 */
export async function buildKineticReel(carouselData, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const slide1 = carouselData.slides[0];
  const slide3 = carouselData.slides[2] || carouselData.slides[1];
  const se = slide1.selfExplainer || {};

  // 1. Prepare Voiceover Script
  const hookText = slide1.title.replace(/[:\-]/g, '.');
  const leftDesc = se.left?.text || 'the intuitive move will fix the problem';
  const rightDesc = se.right?.text || 'the system counterattacks and multiplies the error';
  
  const voiceScript = `${hookText}. Most people believe that ${leftDesc}. But in reality, ${rightDesc}.`;
  const voicePath = path.join(outputDir, 'voice.mp3');

  console.log(`🎙️ [KineticReel] Generating voiceover: "${voiceScript}"`);
  const { duration: voiceDuration } = await generateVoiceover(voiceScript, voicePath);

  // Give 0.8s padding at the end
  const totalDuration = Math.max(7.5, voiceDuration + 0.8);

  // 2. Render Native 1080x1920 Visual Card with Puppeteer
  const templatePath = path.join(__dirname, 'reel_template.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  // Format title with highlight
  const titleWords = slide1.title.split(' ');
  let formattedTitle = slide1.title;
  if (titleWords.length > 2) {
    const lastTwo = titleWords.slice(-2).join(' ');
    const firstPart = titleWords.slice(0, -2).join(' ');
    formattedTitle = `${firstPart} <span class="highlight">${lastTwo}</span>`;
  }

  // Build 3-step diagram HTML
  let chainHtml = '';
  if (slide3.diagram && slide3.diagram.steps) {
    slide3.diagram.steps.slice(0, 3).forEach((step, idx) => {
      chainHtml += `
        <div class="chain-step">
          <div class="step-num">${idx + 1}</div>
          <div class="step-desc">${step.icon || '⚡'} ${step.title || step.label}</div>
        </div>
      `;
    });
  } else {
    chainHtml = `
      <div class="chain-step">
        <div class="step-num">1</div>
        <div class="step-desc">💡 Initial Action: Well-meaning policy is deployed</div>
      </div>
      <div class="chain-step">
        <div class="step-num">2</div>
        <div class="step-desc">🔄 System Feedback: Incentives shift unintended behavior</div>
      </div>
      <div class="chain-step">
        <div class="step-num">3</div>
        <div class="step-desc">💥 Paradox Result: The original problem gets magnified</div>
      </div>
    `;
  }

  html = html
    .replace('{{HANDLE}}', carouselData.handle || '@systems.thinking.lab')
    .replace('{{CATEGORY}}', slide1.tag || 'SYSTEM PARADOX')
    .replace('{{HOOK_TITLE}}', formattedTitle)
    .replace('{{SUBTITLE}}', slide1.subtitle || 'Why honest rules backfire & emergence happens')
    .replace('{{LEFT_BADGE}}', se.left?.badge || 'What We Think')
    .replace('{{LEFT_TEXT}}', leftDesc)
    .replace('{{RIGHT_BADGE}}', se.right?.badge || 'System Reality')
    .replace('{{RIGHT_TEXT}}', rightDesc)
    .replace('{{CHAIN_STEPS}}', chainHtml);

  // Launch Puppeteer to render crisp 1080x1920 image
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  if (fs.existsSync(chromePath)) launchOptions.executablePath = chromePath;

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const cardPath = path.join(outputDir, 'reel_card.png');
  await page.screenshot({ path: cardPath, type: 'png' });
  await browser.close();
  console.log(`🎨 [KineticReel] Rendered native 1080x1920 visual card: ${cardPath}`);

  // 3. Compile Reel with FFmpeg (High-speed 1080x1920 + Voiceover + Ambient Drone)
  const ffmpeg = getFFmpegPath();
  const outMp4 = path.join(outputDir, 'reel.mp4');

  // Fast, crisp native scale with 30fps CFR
  const filter = `[0:v]scale=1080:1920,format=yuv420p[v]`;

  // Deep ambient sub-bass drone mixed cleanly under voiceover
  const droneFilter = `aevalsrc=0.04*sin(2*PI*55*t)+0.02*sin(2*PI*110*t):s=48000:d=${totalDuration}:c=stereo[amb]; [1:a]volume=1.2[vox]; [vox][amb]amix=inputs=2:duration=first[a]`;

  const args = [
    `"${ffmpeg}"`,
    `-loop 1 -t ${totalDuration} -i "${cardPath}"`,
    `-i "${voicePath}"`,
    `-filter_complex "${filter}; ${droneFilter}"`,
    `-map "[v]"`,
    `-map "[a]"`,
    `-c:v libx264`,
    `-profile:v high -level 4.1`,
    `-preset veryfast`,
    `-c:a aac -b:a 192k -ar 48000 -ac 2`,
    `-movflags +faststart`,
    `-r 30`,
    `-shortest`,
    `-y "${outMp4}"`
  ].join(' ');

  console.log(`🎬 [KineticReel] Compiling ${totalDuration.toFixed(1)}s cinematic Reel with narration...`);
  execSync(args, { stdio: 'pipe' });

  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error('Kinetic Reel rendering failed. Output mp4 is missing or empty.');
  }

  const sizeKb = Math.round(fs.statSync(outMp4).size / 1024);
  console.log(`🚀 [KineticReel] High-motion Reel compiled successfully: ${outMp4} (${sizeKb} KB, ${totalDuration.toFixed(1)}s)`);
  return outMp4;
}

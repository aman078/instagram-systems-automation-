import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function renderNewsCarousel(carouselData, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const templatePath = path.join(__dirname, 'news_template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  if (fs.existsSync(chromePath)) {
    launchOptions.executablePath = chromePath;
  }

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();

  await page.setViewport({
    width: 1080,
    height: 1350,
    deviceScaleFactor: 2
  });

  const generatedFiles = [];
  const totalSlides = carouselData.slides.length;

  for (let i = 0; i < totalSlides; i++) {
    const slide = carouselData.slides[i];
    const slideNum = (i + 1).toString();
    const totalNum = totalSlides.toString();

    let cardBodyHtml = '';

    // Slide 1: The Ripple Radar (Micro ➔ Meso ➔ Macro)
    if (slide.rippleRadar && Array.isArray(slide.rippleRadar)) {
      const rowsHtml = slide.rippleRadar.map(row => {
        const lvl = (row.level || 'MICRO').toLowerCase();
        return `
          <div class="ripple-row ${lvl}">
            <div class="level-tag">${row.level}</div>
            <div class="ripple-text">${row.text}</div>
          </div>
        `;
      }).join('');

      cardBodyHtml = `
        <div class="ripple-grid">
          ${rowsHtml}
        </div>
      `;
    }

    // Slides 2-5: The Detailed Intelligence Points
    if (slide.points && Array.isArray(slide.points) && slide.points.length > 0) {
      const pointsHtml = slide.points.map((pt, idx) => `
        <div class="news-point-item">
          <div class="news-point-num">${idx + 1}</div>
          <div class="news-point-text">${pt}</div>
        </div>
      `).join('');

      cardBodyHtml = `
        <div class="news-points">
          ${pointsHtml}
        </div>
      `;
    }

    // Shockwave banner
    let shockwaveHtml = '';
    if (slide.shockwave) {
      shockwaveHtml = `
        <div class="shockwave-banner">
          <div class="shockwave-icon">⚡</div>
          <div class="shockwave-text"><strong>System Law:</strong> ${slide.shockwave}</div>
        </div>
      `;
    }

    const footerAction = (i === totalSlides - 1)
      ? `<span>Save for your strategic shelf</span><span class="arrow">🔖</span>`
      : `<span>Next shockwave</span><span class="arrow">➔</span>`;

    let slideHtml = templateHtml
      .replaceAll('{{CATEGORY}}', carouselData.category || 'GLOBAL SYSTEM RADAR')
      .replaceAll('{{CURRENT_SLIDE}}', slideNum)
      .replaceAll('{{TOTAL_SLIDES}}', totalNum)
      .replaceAll('{{HEADLINE_TAG}}', slide.headlineTag || '🔴 BREAKING ANALYSIS')
      .replaceAll('{{TITLE}}', slide.title || '')
      .replaceAll('{{SUBTITLE}}', slide.subtitle || '')
      .replaceAll('{{CARD_BODY}}', cardBodyHtml)
      .replaceAll('{{SHOCKWAVE_BANNER}}', shockwaveHtml)
      .replaceAll('{{HANDLE}}', carouselData.handle || '@systems.thinking.lab')
      .replaceAll('{{FOOTER_ACTION}}', footerAction);

    await page.setContent(slideHtml, { waitUntil: 'domcontentloaded' });
    try {
      await page.evaluateHandle('document.fonts.ready');
    } catch (e) {}

    const outputFile = path.join(outputDir, `slide_${slideNum}.png`);
    await page.screenshot({
      path: outputFile,
      type: 'png'
    });

    console.log(`Rendered News Slide: ${outputFile}`);
    generatedFiles.push(outputFile);
  }

  await browser.close();

  const captionPath = path.join(outputDir, 'caption.txt');
  fs.writeFileSync(captionPath, carouselData.caption, 'utf8');
  console.log(`Saved news caption: ${captionPath}`);

  return generatedFiles;
}

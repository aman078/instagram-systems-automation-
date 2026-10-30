import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function renderCarousel(carouselData, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const templatePath = path.join(__dirname, 'template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  // Check if system Chrome is available, else use puppeteer's bundled browser
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

  // Instagram vertical carousel size
  await page.setViewport({
    width: 1080,
    height: 1350,
    deviceScaleFactor: 2 // Crisp high-DPI rendering
  });

  const generatedFiles = [];
  const totalSlides = carouselData.slides.length;

  for (let i = 0; i < totalSlides; i++) {
    const slide = carouselData.slides[i];
    const slideNum = (i + 1).toString();
    const totalNum = totalSlides.toString();

    // Build points HTML
    let pointsHtml = '';
    if (slide.points && Array.isArray(slide.points)) {
      pointsHtml = slide.points.map((pt, idx) => `
        <div class="point-item">
          <div class="point-bubble">${idx + 1}</div>
          <div class="point-text">${pt}</div>
        </div>
      `).join('');
    }

    // Build takeaway sticky note HTML if present
    let takeawayHtml = '';
    if (slide.takeaway) {
      takeawayHtml = `
        <div class="sticky-note">
          <span style="font-size: 26px;">💡</span>
          <div class="sticky-text">
            <strong>${slide.takeaway.label || 'The Human Lesson'}:</strong> "${slide.takeaway.text}"
          </div>
        </div>
      `;
    }

    // Visual Continuity: Progressively walk character across the line
    // Slide 1: 15% -> Slide 2: 35% -> Slide 3: 55% -> Slide 4: 75% -> Slide 5: 95%
    const progressPercent = Math.round(((i + 1) / totalSlides) * 100);
    const characterIcons = ['🐾', '🚶‍♂️', '👀', '💡', '🌱'];
    const currentIcon = characterIcons[i % characterIcons.length];

    // Replace placeholders in HTML
    let slideHtml = templateHtml
      .replace(/Chapter 01/g, `Chapter ${carouselData.episode || '01'}`)
      .replace(/@systems\.thinking\.lab/g, carouselData.handle || '@systems.thinking.lab')
      .replace(/✨ The True Story/g, slide.tag || '✨ The Story')
      .replace(/Why Paying For Dead Snakes Made More Snakes/g, slide.title)
      .replace(/How an honest rule in colonial Delhi backfired completely\./g, slide.subtitle || '')
      .replace(/<div class="points-list" id="pointsList">[\s\S]*?<\/div>/, `<div class="points-list" id="pointsList">${pointsHtml}</div>`)
      .replace(/<div class="sticky-note" id="takeawayCard">[\s\S]*?<\/div>/, takeawayHtml)
      .replace(/<span id="currentSlide">1<\/span>/, `<span id="currentSlide">${slideNum}</span>`)
      .replace(/<span id="totalSlides">5<\/span>/, `<span id="totalSlides">${totalNum}</span>`)
      .replace(/right: 0px;/, `left: calc(${progressPercent}% - 20px);`)
      .replace(/🐾/, currentIcon);

    if (i === totalSlides - 1) {
      // Last slide CTA
      slideHtml = slideHtml.replace(
        /<div class="next-hint" id="actionHint">[\s\S]*?<\/div>/,
        `<div class="next-hint" id="actionHint"><span>Save for your shelf</span><span class="arrow">🔖</span></div>`
      );
    }

    await page.setContent(slideHtml, { waitUntil: 'domcontentloaded' });
    try {
      await page.evaluateHandle('document.fonts.ready');
    } catch (e) {
      // Font fallback is fine
    }

    const outputPath = path.join(outputDir, `slide_${slideNum}.png`);
    await page.screenshot({ path: outputPath, type: 'png' });
    generatedFiles.push(outputPath);
    console.log(`Rendered: ${outputPath}`);
  }

  await browser.close();

  // Save caption.txt
  if (carouselData.caption) {
    const captionPath = path.join(outputDir, 'caption.txt');
    fs.writeFileSync(captionPath, carouselData.caption, 'utf8');
    console.log(`Saved caption: ${captionPath}`);
  }

  return generatedFiles;
}

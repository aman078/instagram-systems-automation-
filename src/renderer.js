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

    // 1. Build Slide Body (Diagram, Points, or both)
    let bodyHtml = '';

    // If slide has a visual explainer / diagram
    if (slide.diagram && slide.diagram.steps && Array.isArray(slide.diagram.steps)) {
      const badge = slide.diagram.badge || '🔄 The System Reaction';
      const stepsHtml = slide.diagram.steps.map((st, sIdx) => {
        const isLast = sIdx === slide.diagram.steps.length - 1;
        const highlightClass = isLast ? ' highlight' : '';
        const arrowHtml = !isLast ? `<div class="diagram-arrow">↓</div>` : '';
        return `
          <div class="diagram-step${highlightClass}">
            <div class="step-icon-bubble">${st.icon || '📌'}</div>
            <div class="step-content">
              <div class="step-label">${st.label || `Step ${sIdx + 1}`}</div>
              <div class="step-title">${st.title}</div>
            </div>
          </div>
          ${arrowHtml}
        `;
      }).join('');

      bodyHtml += `
        <div class="diagram-card">
          <div class="diagram-badge">${badge}</div>
          <div class="diagram-chain">
            ${stepsHtml}
          </div>
        </div>
      `;
    }

    // If slide has narrative bullet points
    if (slide.points && Array.isArray(slide.points) && slide.points.length > 0) {
      const pointsListHtml = slide.points.map((pt, idx) => `
        <div class="point-item">
          <div class="point-bubble">${idx + 1}</div>
          <div class="point-text">${pt}</div>
        </div>
      `).join('');

      bodyHtml += `
        <div class="points-list">
          ${pointsListHtml}
        </div>
      `;
    }

    // 2. Build Takeaway Sticky Note HTML
    let takeawayHtml = '';
    if (slide.takeaway && slide.takeaway.text) {
      takeawayHtml = `
        <div class="sticky-note">
          <span style="font-size: 26px;">💡</span>
          <div class="sticky-text">
            <strong>${slide.takeaway.label || 'The Mental Model'}:</strong> "${slide.takeaway.text}"
          </div>
        </div>
      `;
    }

    // 3. Visual Continuity: Progressively walk character across the line
    const progressPercent = Math.round(((i + 1) / totalSlides) * 100);
    const characterIcons = ['🐾', '🚶‍♂️', '👀', '💡', '🌱'];
    const currentIcon = characterIcons[i % characterIcons.length];

    // 4. Footer CTA
    const footerAction = (i === totalSlides - 1)
      ? `<span>Save for your shelf</span><span class="arrow">🔖</span>`
      : `<span>Turn the page</span><span class="arrow">➔</span>`;

    // 5. Clean Template Replacement (No regex fragility, exact placeholders)
    let slideHtml = templateHtml
      .replaceAll('{{CHAPTER_NUM}}', carouselData.episode || '01')
      .replaceAll('{{CURRENT_SLIDE}}', slideNum)
      .replaceAll('{{TOTAL_SLIDES}}', totalNum)
      .replaceAll('{{SLIDE_TAG}}', slide.tag || '✨ The Story')
      .replaceAll('{{SLIDE_TITLE}}', slide.title || '')
      .replaceAll('{{SLIDE_SUBTITLE}}', slide.subtitle || '')
      .replaceAll('{{SLIDE_BODY}}', bodyHtml)
      .replaceAll('{{SLIDE_TAKEAWAY}}', takeawayHtml)
      .replaceAll('{{TRAIL_STYLE}}', `left: calc(${progressPercent}% - 20px);`)
      .replaceAll('{{TRAIL_ICON}}', currentIcon)
      .replaceAll('{{HANDLE}}', carouselData.handle || '@systems.thinking.lab')
      .replaceAll('{{FOOTER_ACTION}}', footerAction);

    await page.setContent(slideHtml, { waitUntil: 'domcontentloaded' });
    try {
      await page.evaluateHandle('document.fonts.ready');
    } catch (e) {
      // Continue even if font ready check times out
    }

    const outputFile = path.join(outputDir, `slide_${slideNum}.png`);
    await page.screenshot({
      path: outputFile,
      type: 'png'
    });

    console.log(`Rendered: ${outputFile}`);
    generatedFiles.push(outputFile);
  }

  await browser.close();

  // Save caption alongside images
  const captionPath = path.join(outputDir, 'caption.txt');
  fs.writeFileSync(captionPath, carouselData.caption, 'utf8');
  console.log(`Saved caption: ${captionPath}`);

  return generatedFiles;
}

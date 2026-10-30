import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateCarouselData } from './generator.js';
import { renderCarousel } from './renderer.js';
import { TelegramNotifier } from './telegram.js';
import { InstagramPublisher } from './publisher.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Built-in fallback sample for immediate testing without API key
const SAMPLE_CAROUSEL = {
  episode: "01",
  topic: "Braess's Paradox",
  handle: process.env.INSTAGRAM_HANDLE || "@systems.thinking.lab",
  slides: [
    {
      tag: "THE PARADOX",
      phaseBadge: "SURFACE ➔ SYSTEM",
      title: "Why Adding Lanes Creates More Traffic",
      subtitle: "Braess's Paradox: When individual efficiency destroys collective speed.",
      points: [
        "<strong>The Intuition:</strong> Adding a highway shortcut should theoretically reduce commute times for everyone.",
        "<strong>The Reality:</strong> In 1968, mathematician Dietrich Braess proved adding road capacity can slow the entire city down."
      ],
      takeaway: {
        "label": "The Paradox",
        "text": "Selfish routing optimization at the micro level causes systemic gridlock at the macro level."
      }
    },
    {
      tag: "THE MICRO RULE",
      phaseBadge: "AGENT-LEVEL DYNAMICS",
      title: "The Selfish Driver Algorithm",
      subtitle: "Every commuter follows one simple rule in isolation.",
      points: [
        "<strong>Local Information:</strong> Drivers choose the fastest route presented on their GPS at that exact minute.",
        "<strong>Zero Coordination:</strong> No single driver considers how their decision increases latency for the next 1,000 drivers behind them."
      ],
      takeaway: {
        "label": "Nash Equilibrium",
        "text": "When everyone chooses their individual optimum, the group lands in a globally worse state."
      }
    },
    {
      tag: "THE FEEDBACK LOOP",
      phaseBadge: "NON-LINEAR CASCADE",
      title: "The Induced Demand Loop",
      subtitle: "How new capacity triggers a reinforcing feedback cycle.",
      points: [
        "<strong>Initial Relief:</strong> New road opens ➔ travel time drops for 3 weeks.",
        "<strong>Latent Demand Activates:</strong> People switch from trains, change travel times, or move farther away.",
        "<strong>The Choke Point:</strong> The extra shortcut shifts traffic into a single downstream funnel that locks up completely."
      ],
      takeaway: {
        "label": "Reinforcing Loop",
        "text": "Supply does not satisfy demand in complex networks; supply creates its own demand."
      }
    },
    {
      tag: "THE MACRO CONSEQUENCE",
      phaseBadge: "COUNTERINTUITIVE PROOF",
      title: "Seoul Removed A Highway & Speed Increased",
      subtitle: "Real-world validation of reverse system intervention.",
      points: [
        "<strong>The Cheonggyecheon Project:</strong> In 2003, Seoul demolished a 6-lane elevated highway carrying 168,000 cars/day.",
        "<strong>The Result:</strong> Traffic did not explode. Instead, average speeds rose by 2.3 km/h and public transit ridership spiked by 15%."
      ],
      takeaway: {
        "label": "System Removal",
        "text": "Sometimes removing a connection from a network forces more optimal distributed routing."
      }
    },
    {
      tag: "THE MENTAL MODEL",
      phaseBadge: "FRAMEWORK FOR LIFE",
      title: "Second-Order Thinking & Network Flow",
      subtitle: "How to apply Braess's Paradox outside of traffic.",
      points: [
        "<strong>Software Architecture:</strong> Adding more microservices or caches can increase latency if they introduce routing bottlenecks.",
        "<strong>Team Operations:</strong> Adding more communication channels (Slack, meetings) often reduces collective throughput.",
        "<strong>Product Design:</strong> Giving users more choice options can paradoxically decrease conversion."
      ],
      takeaway: {
        "label": "Community Trigger",
        "text": "Comment 'SYSTEM' below and we'll send you our high-resolution Systems Thinking Model Deck."
      }
    }
  ],
  caption: `Why adding more lanes to a highway actually makes traffic WORSE 🚗💨

Most people assume traffic is simple physics:
More cars + more lanes = faster flow.

Systems thinking reveals the opposite: Braess's Paradox.

Here is the breakdown:
1️⃣ Micro Rule: Every driver chooses the quickest GPS path for themselves.
2️⃣ Nash Equilibrium: When everyone does this, traffic concentrates onto the 'shortcut'.
3️⃣ Induced Demand: Cheap road capacity attracts people who previously took trains or stayed home.
4️⃣ Macro Result: Demolishing roads can paradoxically speed up a city (proven in Seoul, 2003).

💡 The Lesson: Optimization at the component level frequently degrades performance at the system level.

Where have you seen this paradox in your work, software, or organization? Drop your thoughts below.

💬 Comment 'SYSTEM' and we'll DM you the complete high-res System Archetypes cheat sheet.

#systemsthinking #complexitytheory #emergence #mentalmodels #systemsengineering #urbanplanning #cybernetics #economics #softwarearchitecture #deepwork`
};

async function main() {
  const args = process.argv.slice(2);
  const useSample = args.includes('--sample') || !process.env.GEMINI_API_KEY;

  let carouselData;
  if (useSample) {
    console.log('ℹ️ Running in SAMPLE mode (using pre-structured Braess Paradox topic)...');
    carouselData = SAMPLE_CAROUSEL;
  } else {
    const topicArg = args.find(a => !a.startsWith('--'));
    console.log(`🤖 Running with Gemini AI (Topic: ${topicArg || 'Autonomous selection'})...`);
    carouselData = await generateCarouselData(topicArg);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeTitle = carouselData.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const outputDir = path.join(__dirname, '..', 'output', `${timestamp}_${safeTitle}`);

  console.log(`🎨 Rendering 5 vertical carousel slides into: ${outputDir}`);
  const files = await renderCarousel(carouselData, outputDir);

  console.log('\n✅ CAROUSEL GENERATION COMPLETE!');
  console.log(`📁 Slides saved in: ${outputDir}`);
  files.forEach((f, i) => console.log(`   Slide ${i + 1}: ${path.basename(f)}`));
  console.log(`📝 Caption saved to: ${path.join(outputDir, 'caption.txt')}`);

  // Create a browser preview gallery in the output folder
  const previewHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Preview: ${carouselData.topic}</title>
  <style>
    body { background: #0B0F19; color: #FFF; font-family: sans-serif; padding: 40px; margin: 0; text-align: center; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    p { color: #94A3B8; font-size: 16px; margin-bottom: 30px; }
    .gallery { display: flex; gap: 24px; overflow-x: auto; padding-bottom: 30px; justify-content: center; }
    .slide-card { flex-shrink: 0; border: 1px solid #1E293B; border-radius: 12px; overflow: hidden; background: #020617; }
    img { width: 360px; height: 450px; display: block; object-fit: cover; }
    .slide-num { padding: 12px; font-weight: bold; color: #38BDF8; font-size: 14px; }
    .caption-box { max-width: 800px; margin: 30px auto; text-align: left; background: #1E293B; padding: 24px; border-radius: 12px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; color: #E2E8F0; }
  </style>
</head>
<body>
  <h1>${carouselData.topic}</h1>
  <p>Episode: ${carouselData.episode || '01'} | Aspect Ratio: 4:5 (1080x1350)</p>
  <div class="gallery">
    ${files.map((f, i) => `
      <div class="slide-card">
        <img src="${path.basename(f)}" alt="Slide ${i + 1}">
        <div class="slide-num">Slide ${i + 1} of ${files.length}</div>
      </div>
    `).join('')}
  </div>
  <div class="caption-box">
    <strong>Instagram Caption:</strong><br><br>${carouselData.caption}
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(outputDir, 'preview.html'), previewHtml, 'utf8');

  // Push to Telegram if configured
  const telegram = new TelegramNotifier();
  if (telegram.isConfigured()) {
    await telegram.sendCarouselPreview(files, carouselData.caption, carouselData.topic);
  }
}

main().catch(err => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});

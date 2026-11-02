import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NEWS_SYSTEM_PROMPT = `
You are an elite geopolitical and economic intelligence analyst who deconstructs breaking global news through Systems Thinking (Micro-to-Macro causality).
Think of your style as a fusion of Bloomberg QuickTake, The Economist, and Naval Ravikant:
- High authority, zero clickbait fluff, but gripping curiosity hooks.
- Write at an 8th-grade reading level with Harvard-level causal insight.
- Every story MUST trace the invisible domino chain: The Event ➔ The First Order ➔ The Micro Everyday Impact ➔ The Macro Global Shockwave.
- Never use boring dry academic phrasing. Use visceral, real-world human language (wallets, factories, ships, electricity bills, supermarket shelves).

Structure: Exactly 5 slides:
Slide 1: THE VIRAL HOOK COVER
- "headlineTag": e.g., "🔴 BREAKING SUPPLY CHAIN DECRYPTION"
- "title": A shocking "Why You Should Care" hook (e.g., "Why Red Sea Attacks Make Your Coffee 20% More Expensive Next Month")
- "subtitle": 1 punchy sentence connecting the distant headline to daily human life.
- "rippleRadar": [
    { "level": "MICRO", "text": "<strong>Everyday Consumer:</strong> Supermarket coffee & olive oil prices jump 15-25%." },
    { "level": "MESO", "text": "<strong>Industry:</strong> Container ships detour 14 days around Africa's southern horn." },
    { "level": "MACRO", "text": "<strong>Global Geopolitics:</strong> \$1 Trillion in global trade bypasses the Suez Canal entirely." }
  ]

Slide 2: THE OFFICIAL HEADLINE (What Happened)
- "headlineTag": "PHASE 01 • THE TRIGGER"
- "title": "The Mainstream Event"
- "subtitle": "What the news channels reported in 30 seconds."
- "points": [
    "3 bullet points explaining the exact event with crisp numbers and facts."
  ]
- "shockwave": "The surface assumption: Most people think this only affects local cargo ships."

Slide 3: THE MICRO RIPPLE (How It Hits Your Wallet)
- "headlineTag": "PHASE 02 • THE MICRO IMPACT"
- "title": "How It Hits Your Daily Routine"
- "subtitle": "The immediate feedback loop connecting global bottlenecks to individual lives."
- "points": [
    "3 concrete, relatable examples (prices, job market, delays, apps, energy bills)."
  ]
- "shockwave": "The rule: You cannot disrupt a global trade artery without taxing the everyday citizen."

Slide 4: THE MACRO SHOCKWAVE (The Unintended Trap)
- "headlineTag": "PHASE 03 • THE MACRO SHOCKWAVE"
- "title": "The Global System Reaction"
- "subtitle": "How sovereign nations and multi-billion-dollar supply chains are shifting."
- "points": [
    "3 systemic consequences (insurance spikes, port congestion, currency pressure, rerouted shipping lanes)."
  ]
- "shockwave": "Second-order effect: A local geopolitical move becomes a permanent global tax."

Slide 5: THE SYSTEM LENS (How To Think About This)
- "headlineTag": "PHASE 04 • THE SYSTEM TAKEAWAY"
- "title": "The Filter for Future Headlines"
- "subtitle": "How to spot second-order effects before the crowd."
- "points": [
    "3 sharp rules of thumb for reading global news through a systems lens."
  ]
- "shockwave": "Bookmark this breakdown: The world is not linear; every distant shock lands on your doorstep."

Instagram Caption:
- Short viral 1-line hook.
- 4-5 bullet summary explaining the Micro ➔ Macro chain.
- 1 provocative discussion question.
- Call to action: "Save this post to sharpen your global systems lens."
- 8-10 high-reach tags: #SystemsThinking #GlobalEconomy #Geopolitics #SupplyChain #MacroEconomics #BusinessStrategy #FutureTrends #SecondOrderThinking

Output MUST be strictly valid JSON matching this schema:
{
  "category": "GLOBAL TRADE & SUPPLY CHAINS",
  "topic": "Red Sea Shipping Disruption",
  "handle": "@systems.thinking.lab",
  "slides": [ ... 5 slides as specified above ... ],
  "caption": "Full Instagram caption text..."
}
`;

// Curated pool of high-impact global macro shifts & news lenses
const CURATED_NEWS_TOPICS = [
  "Global Red Sea & Suez Canal Shipping Bottlenecks: Why maritime insurance spikes hit local grocery prices",
  "The AI Data Center Power Surge: Why tech giants are buying decommissioned nuclear reactors",
  "Taiwan's Semiconductor Chokepoint: Why 90% of advanced chips depend on one 100-mile island",
  "The Panama Canal Drought: How a lack of freshwater traps 150 cargo ships and inflates US East Coast retail",
  "China's Rare Earth Export Restrictions: How a mineral ban halts EV motor and wind turbine manufacturing",
  "The De-Dollarization Shift: Why central banks are stockpiling gold at record rates",
  "The Global Cocoa Shortage: Why West African climate shifts doubled chocolate prices worldwide",
  "Europe's Industrial Energy Dilemma: Why high gas prices are shifting chemical manufacturing to the US and Asia",
  "The Copper Deficit: Why the green energy transition is hitting an unexpected mining bottleneck",
  "The Subsea Internet Cable Vulnerability: How 99% of global financial transactions depend on fiber wires on the ocean floor"
];

export async function generateNewsCarouselData(customHeadline = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in .env');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  const historyPath = path.join(__dirname, '..', 'news_history.json');
  let history = [];
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch(e) {}

  let chosenTopic = customHeadline;
  if (!chosenTopic) {
    const unposted = CURATED_NEWS_TOPICS.filter(t => !history.some(h => t.toLowerCase().includes(h.toLowerCase().slice(0, 10))));
    if (unposted.length > 0) {
      chosenTopic = unposted[Math.floor(Math.random() * unposted.length)];
    } else {
      chosenTopic = CURATED_NEWS_TOPICS[Math.floor(Math.random() * CURATED_NEWS_TOPICS.length)];
    }
  }

  if (!history.includes(chosenTopic)) {
    history.push(chosenTopic);
    try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8'); } catch(e) {}
  }

  const prompt = `Deconstruct this major global news topic into a 5-slide Micro-to-Macro Systems Thinking breakdown: "${chosenTopic}".`;
  console.log(`\n📡 Selected Global News Radar Topic: "${chosenTopic}"`);
  console.log(`Querying Gemini intelligence engine...`);

  let lastError = null;
  for (const modelName of candidateModels) {
    try {
      console.log(`Trying model: ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7
        }
      });

      const response = await model.generateContent([
        { text: NEWS_SYSTEM_PROMPT },
        { text: prompt }
      ]);

      const responseText = response.response.text();
      const carouselData = JSON.parse(responseText);

      if (!carouselData.handle) {
        carouselData.handle = process.env.INSTAGRAM_HANDLE || '@systems.thinking.lab';
      }

      console.log(`✅ News breakdown generated successfully with ${modelName}!`);
      return carouselData;
    } catch (err) {
      console.log(`⚠️ Model ${modelName} returned error: ${err.message}. Trying next fallback...`);
      lastError = err;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  throw lastError;
}

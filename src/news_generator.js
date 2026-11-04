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
    { "level": "MACRO", "text": "<strong>Global Geopolitics:</strong> $1 Trillion in global trade bypasses the Suez Canal entirely." }
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
- 3-5 unique, specific hashtags relevant strictly to this topic (e.g. #SupplyChain #Geopolitics #GlobalEconomy). Never use repetitive generic hashtag blocks.

Output MUST be strictly valid JSON matching this schema:
{
  "category": "GLOBAL TRADE & SUPPLY CHAINS",
  "topic": "Red Sea Shipping Disruption",
  "handle": "@systems.thinking.lab",
  "slides": [ ... 5 slides as specified above ... ],
  "caption": "Full Instagram caption text..."
}
`;

// Deep pool of 50+ high-impact global macro, tech, energy, and supply chain shifts
const CURATED_NEWS_TOPICS = [
  "Global Red Sea & Suez Canal Shipping Bottlenecks: Why maritime insurance spikes hit local grocery prices",
  "The AI Data Center Power Surge: Why tech giants are buying decommissioned nuclear reactors",
  "Taiwan's Semiconductor Chokepoint: Why 90% of advanced chips depend on one 100-mile island",
  "The Panama Canal Drought: How a lack of freshwater traps 150 cargo ships and inflates retail prices",
  "China's Rare Earth Export Restrictions: How a mineral ban halts EV motor and wind turbine manufacturing",
  "The De-Dollarization Shift: Why central banks are stockpiling gold at record 50-year rates",
  "The Global Cocoa Shortage: Why West African climate shifts doubled chocolate prices worldwide",
  "Europe's Industrial Energy Dilemma: Why high gas prices are shifting chemical manufacturing overseas",
  "The Global Copper Deficit: Why the green energy transition is hitting an unexpected mining bottleneck",
  "The Subsea Internet Cable Vulnerability: How 99% of global transactions depend on unarmored fiber wires",
  "The Jet Fuel Refining Squeeze: Why airline ticket prices stay high even when crude oil drops",
  "The Global Lithium Glut to Deficit Whip: How boom-bust mineral cycles stall electric vehicle adoption",
  "The Commercial Real Estate Debt Wall: How remote work threatens regional banks and pension funds",
  "The Global Fertilizer Chokepoint: Why ammonia shortages in Europe reduce crop yields in South America",
  "The Container Ship Mega-Vessel Trap: Why 24,000-TEU ships create crippling port congestion",
  "The Rare Gas Neon Crisis: How steel manufacturing bottlenecks silently threaten chip fabrication",
  "The Aging Electrical Grid: Why connecting new solar farms takes up to 7 years in developed nations",
  "The Global Beef Herd Contraction: Why historic droughts in Texas and Argentina spike meat prices for years",
  "The Satellite Orbital Jam: How 50,000 low-earth satellites increase collision risks for telecom networks",
  "The Sovereign Debt Spiral: How rising global interest rates force developing nations to cut infrastructure",
  "The Olive Oil Drought in the Mediterranean: Why olive tree failures trigger international food fraud",
  "The Critical Battery Graphite Ban: Why battery anode supply chains are racing to build synthetic plants",
  "The Semiconductor Packaging Bottleneck: Why chip shortages shifted from raw silicon to CoWoS packaging",
  "The Global Rice Export Bans: How export tariffs in Asia spike staple grain prices in Africa",
  "The Nuclear Fuel Enrichment Monopoly: Why Western nuclear reactors depend on Russian enriched uranium",
  "The Commercial Airline Pilot Cliff: Why pilot retirement mandates leave regional airports abandoned",
  "The Fast Fashion Airfreight Surge: Why cheap e-commerce packages monopolize global air cargo holds",
  "The Silicon Valley Venture Capital Freeze: How higher interest rates shifted tech from growth to survival",
  "The Global Sand Crisis: Why the world is running out of construction-grade sand for concrete",
  "The Global Sulfur Shortage: Why clean fuel mandates reduce the byproduct sulfuric acid needed for batteries",
  "The Critical Drug Shortage: Why 80% of generic active pharmaceutical ingredients come from two nations",
  "The Panama Rail Alternative: How dry canals and freight corridors are competing for trade routes",
  "The AI Model Training Water Cost: Why data centers consume millions of gallons of cooling water daily",
  "The Deep-Sea Mining Geopolitical Battle: Why nations are racing for polymetallic nodules on the seabed",
  "The Global Coffee Belt Migration: Why rising temperatures force Arabica plantations higher up mountains",
  "The Arctic Shipping Route Race: How melting polar ice creates a new northern trade corridor",
  "The High-Voltage Transformer Shortage: Why replacing blown substation transformers takes 3 years",
  "The Global Helium Shortage: Why party balloons and medical MRI scanners are competing for noble gas",
  "The Microchip Patent Web: How Dutch lithography machine export bans redraw tech sovereignty",
  "The Global Scrap Steel Wars: Why nations are banning metal exports to decarbonize domestic mills",
  "The Autonomous Drone Freight Shift: How cheap drones are displacing expensive military surface patrols",
  "The Central Bank Digital Currency Race: How programmable money changes cross-border payment rails",
  "The Global Vanilla Volatility: Why 80% of world vanilla comes from one vulnerable island in Madagascar",
  "The Cloud Data Center Land Grab: Why transmission capacity has replaced fiber as tech's rarest asset",
  "The Global Tin Supply Pinch: Why Myanmar mining bans threaten soldering for every printed circuit board",
  "The Commercial Spaceflight Debris Problem: How Kessler Syndrome could trap human orbital access",
  "The Global Uranium Spot Price Rebound: Why 15-year nuclear dormancy gave way to a historic supply crunch",
  "The Aircraft Titanium Dilemma: Why aerospace manufacturers cannot easily replace Russian titanium forgings",
  "The Subsea Power Interconnector Boom: How offshore wind farms transfer electricity between nations",
  "The Global Shipping Carbon Tax: How new maritime emissions levies permanently increase shipping freight"
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
      // If entire catalog completed, discover a brand new global event
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

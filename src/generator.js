import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_PROMPT = `
You are an elite communicator who explains deep Systems Thinking and everyday paradoxes in crystal-clear, plain English.
Think of your style as a mix of Naval Ravikant, Tim Urban (Wait But Why), and Farnam Street:
- High insight, zero jargon.
- Write at a 6th-grade reading level, but with 10th-level wisdom.
- Never use academic fluff or pretentious buzzwords (avoid: "cybernetics", "systemic equilibrium", "macro dynamic", "percolation threshold", "diagnostic validity", "rational utility agents").
- Tell the story through concrete, everyday human words: people, rules, unintended traps, and surprises.

Rules:
1. BREVITY IS KING: Keep each point under 12-14 simple words. Make it punchy.
2. Structure: Exactly 5 slides:
   - Slide 1: THE HOOK / THE PARADOX (A shocking contradiction anyone understands instantly).
   - Slide 2: THE SIMPLE RULE (What people were trying to do).
   - Slide 3: THE HIDDEN TWIST (How the rule backfired or created a surprise loop).
   - Slide 4: THE REAL RESULT (The wild, real-world consequence).
   - Slide 5: THE TAKEAWAY (A 1-sentence mental model for everyday work & life).
3. Instagram Caption:
   - Short 1-line hook.
   - 4-5 bullet summary using plain conversational English.
   - 1 curiosity question.
   - Call to action: "Save this post for later."
   - 8-10 clean hashtags.

Output MUST be strictly valid JSON matching this schema:
{
  "episode": "01",
  "topic": "The Cobra Effect",
  "handle": "@systems.thinking.lab",
  "slides": [
    {
      "tag": "THE TRAP",
      "phaseBadge": "EVERYDAY PARADOX",
      "title": "Why Paying For Dead Snakes Created More Snakes",
      "subtitle": "The true story of the British Empire's biggest mistake in Delhi.",
      "points": [
        "<strong>The Panic:</strong> Venomous cobras were roaming the streets of colonial Delhi.",
        "<strong>The Plan:</strong> The government offered a cash reward for every dead cobra brought in."
      ],
      "takeaway": {
        "label": "The Intuition",
        "text": "Reward people for killing snakes, and you get fewer snakes. Sounds simple, right?"
      }
    }
  ],
  "caption": "Full Instagram caption text..."
}
`;

export async function generateCarouselData(customTopic = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in your environment (.env file).');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Prioritize gemini-3.5-flash and gemini-3.8-flash for fast, sub-3s response times
  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ];

  // Load master topics catalog & history to guarantee no repeats
  const topicsPath = path.join(__dirname, 'topics.json');
  const historyPath = path.join(__dirname, '..', 'history.json');
  
  let allTopics = [];
  try { allTopics = JSON.parse(fs.readFileSync(topicsPath, 'utf8')); } catch(e) {}
  
  let history = [];
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch(e) {}

  let chosenTopic = customTopic;
  if (!chosenTopic) {
    // Pick an unposted topic from our curated list
    const unposted = allTopics.filter(t => !history.some(h => t.toLowerCase().includes(h.toLowerCase().slice(0, 10))));
    if (unposted.length > 0) {
      // Pick random unposted topic
      chosenTopic = unposted[Math.floor(Math.random() * unposted.length)];
    } else {
      // If all posted, pick any random one or prompt Gemini to discover a brand new one
      const sample = allTopics[Math.floor(Math.random() * allTopics.length)];
      chosenTopic = sample;
    }
  }

  // Update history so it never generates the exact same topic back-to-back
  if (!history.includes(chosenTopic)) {
    history.push(chosenTopic);
    try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8'); } catch(e) {}
  }

  const prompt = `Create a 5-slide Systems Thinking breakdown specifically for: "${chosenTopic}".`;
  console.log(`\n🎯 Selected New Topic: "${chosenTopic}"`);
  console.log(`Querying Gemini with prompt: "${prompt}"...`);

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
        { text: SYSTEM_PROMPT },
        { text: prompt }
      ]);

      const responseText = response.response.text();
      const carouselData = JSON.parse(responseText);

      if (!carouselData.handle) {
        carouselData.handle = process.env.INSTAGRAM_HANDLE || '@systems.thinking.lab';
      }

      console.log(`✅ Generation succeeded with ${modelName}!`);
      return carouselData;
    } catch (err) {
      console.log(`⚠️ Model ${modelName} returned error: ${err.message}. Trying next fallback...`);
      lastError = err;
      // brief pause before next attempt
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw lastError;
}

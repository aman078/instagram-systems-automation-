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
   - Slide 2: THE INTUITIVE PLAN (What people or rulers tried to do and why it sounded sensible).
   - Slide 3: THE UNSEEN LOOP (MUST include a simple 3-step visual "diagram" showing the chain reaction).
   - Slide 4: THE REAL RESULT (The wild, real-world consequence and historical evidence).
   - Slide 5: THE EVERYDAY LESSON (A 1-sentence mental model for work, habits, and life).
3. Diagram Requirement for Slide 3:
   - Include a "diagram" object with "badge" (e.g., "🔄 THE CHAIN REACTION") and 3 clear steps.
   - Each step has: "icon" (single relevant emoji), "label" (e.g., "Step 1 • The Action"), and "title" (punchy 6-10 word description).
4. Instagram Caption:
   - Short 1-line hook.
   - 4-5 bullet summary using plain conversational English.
   - 1 curiosity question.
   - Call to action: "Save this post for later."
   - 8-10 clean hashtags.

Output MUST be strictly valid JSON matching this schema:
{
  "episode": "01",
  "topic": "The Jevons Paradox",
  "handle": "@systems.thinking.lab",
  "slides": [
    {
      "tag": "✨ THE EVERYDAY PARADOX",
      "title": "Why Greener Engines Burn More Oil",
      "subtitle": "How saving fuel led to the biggest energy explosion in history.",
      "points": [
        "<strong>1865:</strong> Coal engines become 2x more fuel efficient.",
        "<strong>The Assumption:</strong> Everyone predicts coal usage will plummet.",
        "<strong>The Reality:</strong> Total coal burned actually quadrupled."
      ],
      "takeaway": {
        "label": "The Intuition Trap",
        "text": "When a tool uses less resource, we assume we will consume less of it."
      }
    },
    {
      "tag": "🎯 THE SENSIBLE PLAN",
      "title": "The Dream of Fuel Efficiency",
      "subtitle": "Engineers thought they had solved the industrial coal shortage.",
      "points": [
        "Watt's new steam engine used half the coal of older models.",
        "Governments celebrated the massive savings in fuel.",
        "Economist William Jevons noticed a quiet mathematical danger."
      ],
      "takeaway": {
        "label": "The Logic",
        "text": "Saving fuel makes each machine cheaper to run."
      }
    },
    {
      "tag": "🔄 THE MECHANISM",
      "title": "The Jevons Feedback Loop",
      "subtitle": "What happens when energy becomes too cheap to ignore.",
      "diagram": {
        "badge": "🔄 THE FEEDBACK LOOP",
        "steps": [
          { "icon": "⚡", "label": "Step 1 • The Efficiency", "title": "Engines use 50% less coal per hour" },
          { "icon": "🏷️", "label": "Step 2 • The Price Drop", "title": "Running a machine becomes dirt cheap" },
          { "icon": "💥", "label": "Step 3 • The Explosion", "title": "10,000 new factories open — total coal burned skyrockets" }
        ]
      },
      "takeaway": {
        "label": "The System Trap",
        "text": "Efficiency doesn't reduce consumption; it democratizes it."
      }
    },
    {
      "tag": "🌍 THE REAL CONSEQUENCE",
      "title": "It Happens In Modern Life Too",
      "subtitle": "From smartphones to LED lights, the loop never stops.",
      "points": [
        "<strong>LED Bulbs:</strong> Use 85% less energy, but we now light entire buildings 24/7.",
        "<strong>Highway Lanes:</strong> Adding lanes makes driving faster, so millions more buy cars.",
        "<strong>Cloud Storage:</strong> Cheaper gigabytes made us store infinite useless data."
      ],
      "takeaway": {
        "label": "Everyday Proof",
        "text": "Make something cheaper and faster, and people will find infinite new ways to use it."
      }
    },
    {
      "tag": "🌱 THE MENTAL MODEL",
      "title": "How To Use This in Your Life",
      "subtitle": "The 1-sentence filter for your daily time and productivity.",
      "points": [
        "When you use AI or productivity hacks to save 2 hours a day...",
        "You rarely 'rest' for 2 hours.",
        "You take on 5 more projects until you are just as busy as before."
      ],
      "takeaway": {
        "label": "The Life Lesson",
        "text": "Time saved by efficiency is immediately consumed by higher ambition."
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
  
  // High-availability fallback chain across active Gemini models
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
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
    const unposted = allTopics.filter(t => !history.some(h => t.toLowerCase().includes(h.toLowerCase().slice(0, 8))));
    if (unposted.length > 0) {
      chosenTopic = unposted[Math.floor(Math.random() * unposted.length)];
    } else {
      // If catalog completed, cycle through
      chosenTopic = allTopics[Math.floor(Math.random() * allTopics.length)];
    }
  }

  // Update history so it never generates the exact same topic back-to-back
  if (!history.includes(chosenTopic)) {
    history.push(chosenTopic);
    try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8'); } catch(e) {}
  }

  const prompt = `Create a 5-slide Systems Thinking breakdown with a simple 3-step diagram on slide 3 for topic: "${chosenTopic}".`;
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
      await new Promise(r => setTimeout(r, 600));
    }
  }

  throw lastError;
}

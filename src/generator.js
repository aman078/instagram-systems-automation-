import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_PROMPT = `
You are an elite communicator who explains deep Systems Thinking, game theory traps, and everyday human paradoxes in crystal-clear, plain English with cute minimalist visual diagrams.
Think of your style as a mix of Naval Ravikant, Tim Urban (Wait But Why), and Farnam Street:
- High insight, zero jargon.
- Write at a 6th-grade reading level, but with 10th-level wisdom.
- Never use academic fluff or pretentious buzzwords (avoid: "cybernetics", "systemic equilibrium", "macro dynamic", "percolation threshold", "diagnostic validity", "rational utility agents").
- Tell the story through concrete, everyday human words: people, rules, unintended traps, and surprises.

Rules:
1. BREVITY IS KING: Keep each point under 12-14 simple words. Make it punchy.
2. Structure: Exactly 5 slides:
   - Slide 1: THE HOOK / COVER. MUST include "selfExplainer" (A 5-second minimalist visual contrast comparing "What We Think" vs "What Actually Happens", like cute Telegram wallpaper doodles).
   - Slide 2: THE INTUITIVE PLAN (What people or rulers tried to do and why it sounded sensible).
   - Slide 3: THE UNSEEN LOOP (MUST include "diagram" showing the 3-step chain reaction).
   - Slide 4: THE REAL RESULT (The wild, real-world consequence and everyday proof).
   - Slide 5: THE EVERYDAY LESSON (A 1-sentence mental model for work, habits, and life).
3. Slide 1 Self-Explainer Requirement:
   - Include a "selfExplainer" object with:
     - "tag": "THE 5-SECOND EXPLAINER"
     - "left": { "badge": "What We Think", "icon": "emoji", "text": "1 person takes shortcut..." }
     - "right": { "badge": "What Happens", "icon": "emoji", "text": "1,000 drivers rush in..." }
     - "footnote": "A 1-line quote summarizing the paradox"
4. Slide 3 Diagram Requirement:
   - Include a "diagram" object with "badge" (e.g., "🔄 THE CHAIN REACTION") and 3 clear steps.
   - Each step has: "icon" (single relevant emoji), "label" (e.g., "Step 1 • The Action"), and "title" (punchy 6-10 word description).
5. Instagram Caption:
   - Short 1-line hook.
   - 4-5 bullet summary using plain conversational English.
   - 1 curiosity question.
   - Call to action: "Save this post for later."
   - 8-10 clean hashtags.

Output MUST be strictly valid JSON matching this schema:
{
  "episode": "01",
  "topic": "The Tragedy of the Commons",
  "handle": "@systems.thinking.lab",
  "slides": [
    {
      "tag": "✨ THE EVERYDAY PARADOX",
      "title": "Why Shared Spaces Always Get Ruined",
      "subtitle": "How individual smart choices create collective disasters.",
      "selfExplainer": {
        "tag": "THE 5-SECOND EXPLAINER",
        "left": {
          "badge": "Individual Logic",
          "icon": "☕",
          "text": "'It's only one unwashed mug, someone else will clean it.'"
        },
        "right": {
          "badge": "System Reality",
          "icon": "🧽💥",
          "text": "Everyone thinks the same ➔ The office sink overflows with mold."
        },
        "footnote": "What is rational for one person destroys the space for everyone."
      },
      "takeaway": {
        "label": "The Human Dilemma",
        "text": "When everyone owns something, nobody takes responsibility for it."
      }
    },
    {
      "tag": "🎯 THE COMMON SENSE LOGIC",
      "title": "The Meadow That Fed A Village",
      "subtitle": "Why sharing resources feels like free wealth at first.",
      "points": [
        "Centuries ago, English villagers shared a common grass pasture.",
        "Every farmer was allowed to graze their cattle freely.",
        "At first, there was plenty of sweet green grass for all."
      ],
      "takeaway": {
        "label": "The Incentive",
        "text": "The profit of adding another cow goes entirely to you."
      }
    },
    {
      "tag": "🔄 THE MECHANISM",
      "title": "The Overuse Feedback Loop",
      "subtitle": "The quiet math that bankrupts shared resources.",
      "diagram": {
        "badge": "🔄 THE DOWNWARD SPIRAL",
        "steps": [
          { "icon": "🐄", "label": "Step 1 • Individual Gain", "title": "Farmer adds 1 extra cow for personal profit" },
          { "icon": "🌾", "label": "Step 2 • The Imitation", "title": "Every other farmer copies the move to keep up" },
          { "icon": "🏜️", "label": "Step 3 • Total Collapse", "title": "Pasture is eaten to dust — all cattle starve" }
        ]
      },
      "takeaway": {
        "label": "The Mathematical Trap",
        "text": "Benefits are private, but the destruction is shared."
      }
    },
    {
      "tag": "🌍 EVERYDAY PROOF",
      "title": "It Happens Everywhere Today",
      "subtitle": "From public parks to team Slack channels.",
      "points": [
        "<strong>Office Fridges:</strong> Unlabeled takeout boxes rot for months.",
        "<strong>Ocean Fisheries:</strong> Trawlers overfish because 'if I don't catch it, a rival will.'",
        "<strong>Reply-All Emails:</strong> 1 person saves 5 seconds, wasting 500 hours across the company."
      ],
      "takeaway": {
        "label": "The Modern Pattern",
        "text": "Without boundaries, shared freedom turns into shared ruin."
      }
    },
    {
      "tag": "🌱 THE MENTAL MODEL",
      "title": "How To Protect Shared Spaces",
      "subtitle": "Elinor Ostrom won a Nobel Prize for discovering the cure.",
      "points": [
        "Assign clear boundaries and ownership, or create visible social accountability.",
        "Celebrate people who clean up problems they didn't create.",
        "Ask before taking: 'If everyone acted like me today, would the system survive?'"
      ],
      "takeaway": {
        "label": "The Golden Rule",
        "text": "Act like a steward of the commons, not just an extractor."
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
  
  // High-availability fallback chain
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  // Load master topics catalog & history
  const topicsPath = path.join(__dirname, 'topics.json');
  const historyPath = path.join(__dirname, '..', 'history.json');
  
  let allTopics = [];
  try { allTopics = JSON.parse(fs.readFileSync(topicsPath, 'utf8')); } catch(e) {}
  
  let history = [];
  try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch(e) {}

  let chosenTopic = customTopic;
  if (!chosenTopic) {
    const unposted = allTopics.filter(t => !history.some(h => t.toLowerCase().includes(h.toLowerCase().slice(0, 8))));
    if (unposted.length > 0) {
      chosenTopic = unposted[Math.floor(Math.random() * unposted.length)];
    } else {
      chosenTopic = allTopics[Math.floor(Math.random() * allTopics.length)];
    }
  }

  if (!history.includes(chosenTopic)) {
    history.push(chosenTopic);
    try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8'); } catch(e) {}
  }

  const prompt = `Create a 5-slide Systems Thinking breakdown with a 5-second selfExplainer on Slide 1 and a 3-step diagram on Slide 3 for topic: "${chosenTopic}".`;
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

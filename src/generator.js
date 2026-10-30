import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

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
  // Using gemini-3.5-flash for lightning-fast (2s) free generation
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7
    }
  });

  const prompt = customTopic
    ? `Create a 5-slide Systems Thinking breakdown specifically for: "${customTopic}".`
    : `Select a fascinating, counterintuitive Systems Thinking topic (e.g., Braess's Paradox, The Cobra Effect, Ant Colony Optimization algorithms, The Bullwhip Effect in supply chains, Forest Fire Percolation thresholds, or Tragedy of the Commons) and create the complete 5-slide breakdown.`;

  console.log(`Querying Gemini with prompt: "${prompt}"...`);
  const response = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: prompt }
  ]);

  const responseText = response.response.text();
  const carouselData = JSON.parse(responseText);

  // Set default handle if not present
  if (!carouselData.handle) {
    carouselData.handle = process.env.INSTAGRAM_HANDLE || '@systems.thinking.lab';
  }

  return carouselData;
}

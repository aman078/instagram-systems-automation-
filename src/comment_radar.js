import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Top 20 high-traffic accounts in the systems thinking, mental models, and decision-making niche
export const TOP_CREATORS = [
  { handle: 'naval', name: 'Naval Ravikant', focus: 'Judgment, Specific Knowledge & Permissionless Leverage' },
  { handle: 'sahilbloom', name: 'Sahil Bloom', focus: 'Mental Models, Decision Razors & Compounding' },
  { handle: 'jamesclear', name: 'James Clear', focus: 'Habit Systems, Feedback Loops & Friction' },
  { handle: 'george.mack', name: 'George Mack', focus: 'Hidden Incentives, Mental Models & Asymmetric Bets' },
  { handle: 'visualizevalue', name: 'Jack Butcher', focus: 'Minimalist Systems, Proof of Work & Productized Services' },
  { handle: 'visualcapitalist', name: 'Visual Capitalist', focus: 'Macro Systems, Demographics & Economic Flows' },
  { handle: 'waitbutwhy', name: 'Tim Urban', focus: 'Human Civilization Systems, Procrastination & First Principles' },
  { handle: 'shaanpuri', name: 'Shaan Puri', focus: 'Viral Loops, Business Ideation & Human Psychology' },
  { handle: 'shaneparrish', name: 'Shane Parrish (FS)', focus: 'Second-Order Thinking, Inversion & Decision Traps' },
  { handle: 'hubermanlab', name: 'Andrew Huberman', focus: 'Biological Feedback Loops & Neurobiology Systems' },
  { handle: 'markmanson', name: 'Mark Manson', focus: 'Feedback Loops of Suffering & Values Architecture' },
  { handle: 'thechrisdo', name: 'Chris Do', focus: 'Value Perception, Pricing Psychology & Positioning' },
  { handle: 'principles', name: 'Ray Dalio', focus: 'Economic Machines, Macro Debt Cycles & Reality Principles' },
  { handle: 'morganhousel', name: 'Morgan Housel', focus: 'Psychology of Money, Tail Events & Greed Dynamics' },
  { handle: 'levelsio', name: 'Pieter Levels', focus: 'Automated Micro-SaaS Systems & Solopreneur Leverage' },
  { handle: 'ryanholiday', name: 'Ryan Holiday', focus: 'Stoic Cognitive Models & Ego Traps' },
  { handle: 'thegeneralist', name: 'Mario Gabriele', focus: 'Company Architectures & Flywheels' },
  { handle: 'charliemunger_quotes', name: 'Charlie Munger Lattice', focus: 'Multidisciplinary Thinking & Inversion' },
  { handle: 'davidperell', name: 'David Perell', focus: 'Idea Distribution Systems & Personal Monopolies' },
  { handle: 'steven', name: 'Steven Bartlett', focus: 'Behavioral Economics & Founder Psychology' }
];

/**
 * Uses Gemini to generate 3 high-impact, high-IQ parasite comments for 3 selected creators
 */
export async function generateCommentRadar(count = 3) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing in .env');
  }

  // Shuffle and pick `count` creators
  const shuffled = [...TOP_CREATORS].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, count);

  const genAI = new GoogleGenerativeAI(apiKey);

  const prompt = `
You are the elite chief strategist for @systems.thinking.lab on Instagram.
Your objective is the "Top Creator Parasite Strategy":
We need to post the highest-IQ, most thought-provoking comments on recent posts by 3 top creators to attract curious, ambitious followers to our profile.

The 3 target creators are:
${selected.map((c, i) => `${i + 1}. @${c.handle} (${c.name}) - Focus: ${c.focus}`).join('\n')}

FOR EACH CREATOR:
1. Identify their primary discussion theme (e.g., productivity, compounding, decision traps, leverage, discipline).
2. Write a "Golden Parasite Comment":
   - EXACTLY 2 tight, punchy, intellectually seductive sentences.
   - Reframes their point using a systems-thinking or thermodynamic mental model (feedback loops, entropy, second-order effects, friction, incentives, bottleneck theory).
   - Must STOP SCROLLERS and make people say "Who wrote this? I need to check their page."
   - DO NOT praise the creator (no "Great post!", "So true!", "Love this!"). Drop the insight as an equal thinker.
   - DO NOT promote our account directly (no "Check my page"). The insight itself is the magnet.

Return ONLY a valid JSON array of objects with the exact schema:
[
  {
    "handle": "creator handle without @",
    "name": "creator display name",
    "instagramUrl": "https://www.instagram.com/handle/",
    "postType": "Brief 3-word post theme (e.g. 'On Discipline & Habits')",
    "comment": "The 2-sentence golden insight here."
  }
]
`;

  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash'
  ];

  let lastError = null;
  for (const modelName of candidateModels) {
    try {
      console.log(`📡 [CommentRadar] Querying ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7
        }
      });

      const response = await model.generateContent(prompt);
      let text = response.response.text().trim();
      const results = JSON.parse(text);
      console.log(`✅ [CommentRadar] Successfully generated insights using ${modelName}!`);
      return results;
    } catch (err) {
      console.log(`⚠️ [CommentRadar] Model ${modelName} failed (${err.message}). Trying fallback...`);
      lastError = err;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  throw lastError;
}

/**
 * Formats the radar batch into a Telegram HTML message with 1-tap mobile copy blocks
 */
export function formatRadarTelegramMessage(radarItems) {
  let msg = `📡 <b>AI COMMENT RADAR (TOP 20 PARASITE STRATEGY)</b>\n`;
  msg += `<i>Tap any comment below to copy it instantly, then tap the link to paste on their latest post:</i>\n\n`;

  radarItems.forEach((item, index) => {
    msg += `<b>${index + 1}. <a href="${item.instagramUrl}">@${item.handle}</a> (${item.name})</b>\n`;
    msg += `🎯 <i>Theme: ${item.postType}</i>\n`;
    msg += `📋 <i>Tap text below to copy:</i>\n`;
    msg += `<code>${item.comment}</code>\n\n`;
  });

  msg += `⚡ <b>Strategy Tip:</b> Paste within the first 1-2 hours of their post. Top-voted comments on these 20 accounts generate 50-200 profile visits daily.`;
  return msg;
}

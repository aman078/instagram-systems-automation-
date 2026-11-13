import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { generateCarouselData } from './src/generator.js';
import { buildKineticReel } from './src/kinetic_reel_renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('\n======================================================');
  console.log('🎬 GENERATING FULL CINEMATIC REEL PREVIEW...');
  console.log('======================================================\n');

  // 1. Let Gemini discover a fresh concept
  console.log('1. Brainstorming fresh systems topic with Gemini...');
  const carouselData = await generateCarouselData();
  console.log(`Topic: "${carouselData.topic}"\n`);

  // 2. Compile full Reel with voiceover and audiobed
  const outDir = path.join(__dirname, 'output', 'preview_reel');
  const reelPath = await buildKineticReel(carouselData, outDir);

  console.log('\n======================================================');
  console.log('🎉 REEL GENERATED SUCCESSFULLY!');
  console.log(`File: ${reelPath}`);
  console.log('======================================================\n');

  // Automatically launch the video in Windows default media player
  try {
    execSync(`start "" "${reelPath}"`, { shell: 'cmd.exe' });
    console.log('▶️ Playing video in your media player now...');
  } catch (e) {}
}

runTest().catch(console.error);

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates natural cinematic voiceover using Microsoft Edge Neural TTS.
 * Completely free, zero API key required, infinite quota.
 *
 * @param {string} text The narration script to speak
 * @param {string} outputPath Destination path for the .mp3 file
 * @param {string} voice Neural voice model (default: en-US-ChristopherNeural)
 * @returns {Promise<{ path: string, duration: number }>} File path and audio duration in seconds
 */
export async function generateVoiceover(text, outputPath, voice = 'en-US-ChristopherNeural') {
  const cleanText = text
    .replace(/[#*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Escape quotes for command line
  const escapedText = cleanText.replace(/"/g, '\\"');

  const cmd = `python -m edge_tts --voice ${voice} --text "${escapedText}" --write-media "${outputPath}"`;
  
  console.log(`🎙️ [VoiceGenerator] Synthesizing voiceover (${voice})...`);
  execSync(cmd, { stdio: 'pipe' });

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error(`Voiceover synthesis failed. File is missing or empty at ${outputPath}`);
  }

  // Get duration using ffprobe
  let duration = 7.0;
  try {
    const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
    const durStr = execSync(probeCmd, { stdio: 'pipe' }).toString().trim();
    const parsed = parseFloat(durStr);
    if (!isNaN(parsed) && parsed > 0) {
      duration = parsed;
    }
  } catch (e) {
    console.log('ffprobe duration check note:', e.message);
  }

  console.log(`✅ [VoiceGenerator] Voiceover ready: ${outputPath} (${duration.toFixed(1)}s, ${fs.statSync(outputPath).size} bytes)`);
  return { path: outputPath, duration };
}


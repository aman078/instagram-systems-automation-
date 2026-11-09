import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getFFmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  // Try default system ffmpeg in PATH
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch (e) {}

  // Fallback to known Windows WinGet path
  const winGetPath = 'C:\\Users\\amang\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe';
  if (fs.existsSync(winGetPath)) {
    return winGetPath;
  }

  return 'ffmpeg';
}

/**
 * Builds a viral 5.5-second looping 1080x1920 Instagram Reel from carousel slides.
 * Uses Slide 1 (The Hook) and Slide 3/2 (The Core System Insight) with Ken Burns zoom,
 * smooth crossfade transition, and an ambient synth pulse soundtrack.
 *
 * @param {string} folderPath Directory containing slide_1.png and slide_3.png
 * @param {boolean} isNews Whether the post uses dark mode news styling
 * @returns {Promise<string>} Path to the generated reel.mp4
 */
export async function buildReelFromSlides(folderPath, isNews = false) {
  const slide1 = path.join(folderPath, 'slide_1.png');
  let slide2 = path.join(folderPath, 'slide_3.png');
  if (!fs.existsSync(slide2)) {
    slide2 = path.join(folderPath, 'slide_2.png');
  }

  const outMp4 = path.join(folderPath, 'reel.mp4');

  if (!fs.existsSync(slide1) || !fs.existsSync(slide2)) {
    throw new Error(`Required slide images not found in folder: ${folderPath}`);
  }

  const ffmpeg = getFFmpegPath();
  const bgColor = isNews ? '0x0B0D12' : '0xF7F4EE';

  // Ken Burns subtle zoom + 0.5s crossfade between Slide 1 (Hook) and Slide 2 (Breakdown)
  const filter = [
    `[0:v]scale=1080:1350,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${bgColor},zoompan=z='min(zoom+0.0015,1.08)':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920[v0]`,
    `[1:v]scale=1080:1350,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${bgColor},zoompan=z='min(zoom+0.0015,1.08)':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920[v1]`,
    `[v0][v1]xfade=transition=fade:duration=0.5:offset=2.5[v]`
  ].join('; ');

  // Ambient synth pulse (48kHz stereo, 5.5s)
  const audioFilter = `aevalsrc=0.08*sin(2*PI*110*t)*exp(-3*mod(t\\,1.333))+0.05*sin(2*PI*220*t)*exp(-4*mod(t\\,0.666)):s=48000:d=5.5:c=stereo`;

  const args = [
    `"${ffmpeg}"`,
    `-loop 1 -t 3 -i "${slide1}"`,
    `-loop 1 -t 3 -i "${slide2}"`,
    `-f lavfi -i "${audioFilter}"`,
    `-filter_complex "${filter}"`,
    `-map "[v]"`,
    `-map 2:a`,
    `-c:v libx264`,
    `-profile:v high -level 4.1`,
    `-pix_fmt yuv420p`,
    `-preset fast`,
    `-c:a aac -b:a 128k -ar 48000 -ac 2`,
    `-movflags +faststart`,
    `-r 30`,
    `-shortest`,
    `-y "${outMp4}"`
  ].join(' ');

  console.log(`🎬 [ReelRenderer] Compiling 5.5s vertical Reel (1080x1920) for ${path.basename(folderPath)}...`);
  execSync(args, { stdio: 'pipe' });

  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error('FFmpeg completed but reel.mp4 is missing or empty.');
  }

  const sizeKb = Math.round(fs.statSync(outMp4).size / 1024);
  console.log(`✅ [ReelRenderer] Reel generated successfully: ${outMp4} (${sizeKb} KB)`);
  return outMp4;
}


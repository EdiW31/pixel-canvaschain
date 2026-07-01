/**
 * Painter NFT co-creation pipeline: gpt-4o captions the canvas, then
 * gpt-image-1 reinterprets it from that caption. Output files sit beside the
 * per-epoch snapshots. Fire-and-forget — any failure logs and falls back to
 * the raw pixel snapshot rather than throwing.
 */
import fs from 'fs';
import path from 'path';
import { vision, generateImage, isAIAvailable } from './aiClient.js';

const CAPTION_PROMPT =
  'You are looking at a collaborative pixel art canvas (100×100) ' +
  'painted by many users. In ONE short sentence (under 25 words), ' +
  'describe what the scene depicts. Be specific about subjects, colors, ' +
  'and mood. No prefatory phrases like "this image shows".';

const STYLE_SUFFIX =
  ', rendered as a richly detailed digital painting with vivid colors, ' +
  'cinematic lighting, and clean composition. Preserve the original ' +
  'subject and layout. No text, no watermarks.';

// Run the full painter pipeline for one epoch (snapshotsDir = server/snapshots/).
export async function generatePainterArtifact(epoch, snapshotsDir) {
  if (!isAIAvailable()) {
    console.log(`[painterAI] OPENAI_API_KEY not set — skipping epoch ${epoch}`);
    return null;
  }

  const canvasPath = path.join(snapshotsDir, `epoch-${epoch}-canvas.png`);
  if (!fs.existsSync(canvasPath)) {
    console.warn(`[painterAI] missing canvas snapshot for epoch ${epoch}: ${canvasPath}`);
    return null;
  }

  const captionPath = path.join(snapshotsDir, `epoch-${epoch}-caption.txt`);
  const imagePath   = path.join(snapshotsDir, `epoch-${epoch}-ai.png`);

  // Step 1 — caption the canvas.
  let caption;
  try {
    const buf = fs.readFileSync(canvasPath);
    console.log(`[painterAI] epoch ${epoch}: requesting caption…`);
    caption = await vision(buf, CAPTION_PROMPT, { maxTokens: 60 });
    if (!caption) throw new Error('empty caption');
    fs.writeFileSync(captionPath, caption);
    console.log(`[painterAI] epoch ${epoch} caption: "${caption}"`);
  } catch (err) {
    console.error(`[painterAI] epoch ${epoch} caption failed:`, err?.message ?? err);
    return null;
  }

  // Step 2 — generate the image from the caption.
  try {
    const prompt = caption + STYLE_SUFFIX;
    console.log(`[painterAI] epoch ${epoch}: generating image…`);
    const imgBuf = await generateImage({ prompt, size: '1024x1024' });
    fs.writeFileSync(imagePath, imgBuf);
    console.log(`[painterAI] epoch ${epoch} image saved (${imgBuf.length}B)`);
    return { caption, imagePath };
  } catch (err) {
    console.error(`[painterAI] epoch ${epoch} image gen failed:`, err?.message ?? err);
    return null;
  }
}

import sharp from 'sharp';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

export async function renderCanvasPng(grid, { scale = 8, x = 0, y = 0, w = null, h = null } = {}) {
  const sectW = w ?? CANVAS_WIDTH;
  const sectH = h ?? CANVAS_HEIGHT;

  const rawBytes = new Uint8Array(sectW * sectH * 4);
  let i = 0;
  for (let row = y; row < y + sectH; row++) {
    for (let col = x; col < x + sectW; col++) {
      const hex = grid[row][col] || '#FFFFFF';
      rawBytes[i++] = parseInt(hex.slice(1, 3), 16);
      rawBytes[i++] = parseInt(hex.slice(3, 5), 16);
      rawBytes[i++] = parseInt(hex.slice(5, 7), 16);
      rawBytes[i++] = 255;
    }
  }

  return sharp(Buffer.from(rawBytes), {
    raw: { width: sectW, height: sectH, channels: 4 },
  })
    .resize(sectW * scale, sectH * scale, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

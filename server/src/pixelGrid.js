import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_PIXEL_COLOR } from './constants.js';
import { loadAllPixels, savePixel as dbSavePixel, savePixels as dbSavePixels, pixelCount, clearAllPixels } from './db.js';

/**
 * PixelGrid — the 100x100 canvas state. Lives in memory for fast reads;
 * mutations persist to SQLite synchronously so a restart can rehydrate via
 * hydrateFromDb(). The DB is the display source of truth at boot; the
 * blockchain remains authoritative for ownership.
 */
class PixelGrid {
  constructor() {
    this.grid = Array(CANVAS_HEIGHT)
      .fill(null)
      .map(() => Array(CANVAS_WIDTH).fill(DEFAULT_PIXEL_COLOR));

    // Mirror grid of only DB-confirmed (on-chain-paid-for) pixels. Served on
    // reconnect so clients don't inherit ghost pixels from failed paint txs.
    this.confirmedGrid = Array(CANVAS_HEIGHT)
      .fill(null)
      .map(() => Array(CANVAS_WIDTH).fill(DEFAULT_PIXEL_COLOR));

    this.lastModified = new Date();
    console.log(`✅ Pixel grid initialized: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
  }

  // Rehydrate the in-memory grid from SQLite. Called once on boot before listen;
  // errors propagate so the server doesn't start with an empty canvas.
  hydrateFromDb() {
    const rows = loadAllPixels();
    let applied = 0;
    let invalid = 0;
    for (const { x, y, color } of rows) {
      if (this.isValidCoordinate(x, y) && this.isValidColor(color)) {
        this.grid[y][x] = color;
        this.confirmedGrid[y][x] = color;
        applied++;
      } else {
        invalid++;
      }
    }
    this.lastModified = new Date();
    if (invalid > 0) {
      console.warn(`[hydrateFromDb] skipped ${invalid} malformed rows (out of ${rows.length})`);
    }
    console.log(`✅ Hydrated ${applied} pixels from SQLite (db rows: ${pixelCount()})`);
  }

  getGrid() {
    return this.grid;
  }

  // Grid of only on-chain-confirmed pixels; served on canvas:request.
  getConfirmedGrid() {
    return this.confirmedGrid;
  }

  getPixel(x, y) {
    if (!this.isValidCoordinate(x, y)) {
      return null;
    }
    return this.grid[y][x];
  }

  // Set a single pixel in memory and SQLite. DB errors are logged but don't
  // fail the paint — in-memory state still updates and broadcasts.
  setPixel(x, y, color, address = null) {
    if (!this.isValidCoordinate(x, y)) {
      console.error(`❌ Invalid coordinates: (${x}, ${y})`);
      return false;
    }

    if (!this.isValidColor(color)) {
      console.error(`❌ Invalid color format: ${color}`);
      return false;
    }

    this.grid[y][x] = color;
    this.lastModified = new Date();
    try {
      dbSavePixel(x, y, color, address);
      this.confirmedGrid[y][x] = color;
    } catch (e) {
      console.error('[setPixel] DB write failed (pixel in memory only):', e?.message ?? e);
    }
    return true;
  }

  // Validate and apply a batch of pixels in memory and SQLite (same error policy
  // as setPixel).
  setPixelsBatch(batch, address = null) {
    const enriched = [];
    for (const p of batch) {
      if (this.isValidCoordinate(p.x, p.y) && this.isValidColor(p.color)) {
        this.grid[p.y][p.x] = p.color;
        enriched.push({ x: p.x, y: p.y, color: p.color, address });
      }
    }
    if (enriched.length === 0) return enriched;
    this.lastModified = new Date();
    try {
      dbSavePixels(enriched);
      for (const p of enriched) this.confirmedGrid[p.y][p.x] = p.color;
    } catch (e) {
      console.error('[setPixelsBatch] DB write failed (pixel in memory only):', e?.message ?? e);
    }
    return enriched;
  }

  // Persist a batch to SQLite when the paintPixels tx is confirmed on-chain.
  // Idempotent (upsert by x,y). DB errors are rethrown so the caller decides.
  persistPixels(pixels, address = null) {
    if (!Array.isArray(pixels) || pixels.length === 0) return 0;
    const enriched = [];
    const skipped = [];
    for (const p of pixels) {
      if (this.isValidCoordinate(p.x, p.y) && this.isValidColor(p.color)) {
        enriched.push({ x: p.x, y: p.y, color: p.color, address });
      } else {
        skipped.push(p);
      }
    }
    if (skipped.length > 0) {
      console.warn(
        `[persistPixels] skipped ${skipped.length}/${pixels.length} invalid records`,
        JSON.stringify(skipped.slice(0, 3)),
      );
    }
    if (enriched.length === 0) return 0;

    try {
      dbSavePixels(enriched);
    } catch (e) {
      console.error('[persistPixels] DB write failed:', e?.message ?? e);
      console.error('[persistPixels] sample row:', JSON.stringify(enriched[0]));
      throw e;
    }

    // Only after a successful DB write: mirror into confirmedGrid (truth served
    // on reconnect) and the live grid (for currently-connected clients).
    for (const p of enriched) {
      this.confirmedGrid[p.y][p.x] = p.color;
      this.grid[p.y][p.x] = p.color;
    }
    this.lastModified = new Date();
    return enriched.length;
  }

  // Wipe the whole canvas in memory and SQLite. Called when the epoch poller
  // detects an on-chain increment — each new epoch begins blank.
  clearAll() {
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        this.grid[y][x] = DEFAULT_PIXEL_COLOR;
        this.confirmedGrid[y][x] = DEFAULT_PIXEL_COLOR;
      }
    }
    this.lastModified = new Date();
    try { clearAllPixels(); }
    catch (e) { console.error('[pixelGrid.clearAll] DB wipe failed:', e.message); }
    console.log('🎬 Canvas cleared (memory + DB)');
  }

  // Revert optimistic pixels to their confirmed color (white if never confirmed),
  // in memory only. Avoids wiping another user's confirmed pixel at the same coords.
  revertPixels(pixels) {
    if (!Array.isArray(pixels) || pixels.length === 0) return [];
    const reverted = [];
    for (const { x, y } of pixels) {
      if (this.isValidCoordinate(x, y)) {
        const restored = this.confirmedGrid[y][x] ?? DEFAULT_PIXEL_COLOR;
        this.grid[y][x] = restored;
        reverted.push({ x, y, color: restored });
      }
    }
    if (reverted.length) this.lastModified = new Date();
    return reverted;
  }

  isValidCoordinate(x, y) {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      x < CANVAS_WIDTH &&
      y >= 0 &&
      y < CANVAS_HEIGHT
    );
  }

  isValidColor(color) {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    return hexColorRegex.test(color);
  }

  getStats() {
    let paintedPixels = 0;
    const colorCounts = {};

    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const color = this.grid[y][x];
        if (color !== DEFAULT_PIXEL_COLOR) {
          paintedPixels++;
        }
        colorCounts[color] = (colorCounts[color] || 0) + 1;
      }
    }

    return {
      totalPixels: CANVAS_WIDTH * CANVAS_HEIGHT,
      paintedPixels,
      unpaintedPixels: CANVAS_WIDTH * CANVAS_HEIGHT - paintedPixels,
      uniqueColors: Object.keys(colorCounts).length,
      lastModified: this.lastModified,
    };
  }

  getRawRgbaBytes(x = 0, y = 0, w = CANVAS_WIDTH, h = CANVAS_HEIGHT) {
    const buf = new Uint8Array(w * h * 4);
    let i = 0;
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        const hex = this.grid[row][col] || DEFAULT_PIXEL_COLOR;
        buf[i++] = parseInt(hex.slice(1, 3), 16);
        buf[i++] = parseInt(hex.slice(3, 5), 16);
        buf[i++] = parseInt(hex.slice(5, 7), 16);
        buf[i++] = 255;
      }
    }
    return buf;
  }

  // Like getRawRgbaBytes but from confirmedGrid, so unconfirmed pixels can never
  // bleed into a frozen epoch NFT image.
  getConfirmedRawRgbaBytes(x = 0, y = 0, w = CANVAS_WIDTH, h = CANVAS_HEIGHT) {
    const buf = new Uint8Array(w * h * 4);
    let i = 0;
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        const hex = this.confirmedGrid[row][col] || DEFAULT_PIXEL_COLOR;
        buf[i++] = parseInt(hex.slice(1, 3), 16);
        buf[i++] = parseInt(hex.slice(3, 5), 16);
        buf[i++] = parseInt(hex.slice(5, 7), 16);
        buf[i++] = 255;
      }
    }
    return buf;
  }

  getCompressedGrid() {
    const flatGrid = this.grid.flat();
    const jsonString = JSON.stringify(flatGrid);
    return Buffer.from(jsonString).toString('base64');
  }

  loadCompressedGrid(compressedData) {
    try {
      const jsonString = Buffer.from(compressedData, 'base64').toString();
      const flatGrid = JSON.parse(jsonString);

      for (let y = 0; y < CANVAS_HEIGHT; y++) {
        for (let x = 0; x < CANVAS_WIDTH; x++) {
          this.grid[y][x] = flatGrid[y * CANVAS_WIDTH + x];
        }
      }

      console.log('✅ Grid loaded from compressed data');
      return true;
    } catch (error) {
      console.error('❌ Failed to load compressed grid:', error);
      return false;
    }
  }
}

const pixelGrid = new PixelGrid();

export default pixelGrid;

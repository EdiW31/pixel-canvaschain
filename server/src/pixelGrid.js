import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_PIXEL_COLOR } from './constants.js';
import { loadAllPixels, savePixels as dbSavePixels, pixelCount, clearAllPixels } from './db.js';

/**
 * PixelGrid - Manages the 100x100 pixel canvas state.
 *
 * Grid lives in memory for fast reads; mutations are persisted to SQLite
 * synchronously so a server restart can rehydrate the same canvas via
 * hydrateFromDb(). Blockchain queries remain authoritative for ownership,
 * but DB is the source of truth at boot.
 */

class PixelGrid {
  constructor() {
    this.grid = Array(CANVAS_HEIGHT)
      .fill(null)
      .map(() => Array(CANVAS_WIDTH).fill(DEFAULT_PIXEL_COLOR));

    this.lastModified = new Date();
    console.log(`✅ Pixel grid initialized: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
  }

  /**
   * Rehydrate the in-memory grid from the SQLite store. Idempotent.
   * Called once on server boot, before HTTP listen.
   */
  hydrateFromDb() {
    const rows = loadAllPixels();
    for (const { x, y, color } of rows) {
      if (this.isValidCoordinate(x, y) && this.isValidColor(color)) {
        this.grid[y][x] = color;
      }
    }
    this.lastModified = new Date();
    console.log(`✅ Hydrated ${rows.length} pixels from SQLite (db rows: ${pixelCount()})`);
  }

  getGrid() {
    return this.grid;
  }

  // Gets the color of a specific pixel
  getPixel(x, y) {
    if (!this.isValidCoordinate(x, y)) {
      return null;
    }
    return this.grid[y][x];
  }

  /**
   * Set a single pixel's color IN MEMORY ONLY.
   * DB persistence happens later via persistPixels() once the user's
   * paintPixels tx is confirmed on-chain.
   */
  setPixel(x, y, color, _address = null) {
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
    return true;
  }

  /**
   * Validate and apply a batch of pixels IN MEMORY ONLY.
   * DB persistence happens later via persistPixels() on tx confirmation.
   */
  setPixelsBatch(batch, address = null) {
    const enriched = [];
    for (const p of batch) {
      if (this.isValidCoordinate(p.x, p.y) && this.isValidColor(p.color)) {
        this.grid[p.y][p.x] = p.color;
        enriched.push({ x: p.x, y: p.y, color: p.color, address });
      }
    }
    if (enriched.length) this.lastModified = new Date();
    return enriched;
  }

  /**
   * Persist a batch of pixels to SQLite. Called when the user's paintPixels
   * ESDT tx is confirmed successful on devnet — DB rows then survive restart.
   * Idempotent: existing (x,y) rows are upserted with the new color.
   */
  persistPixels(pixels, address = null) {
    if (!Array.isArray(pixels) || pixels.length === 0) return 0;
    const enriched = [];
    for (const p of pixels) {
      if (this.isValidCoordinate(p.x, p.y) && this.isValidColor(p.color)) {
        enriched.push({ x: p.x, y: p.y, color: p.color, address });
      }
    }
    if (enriched.length === 0) return 0;
    try { dbSavePixels(enriched); }
    catch (e) { console.error('[db] persistPixels failed:', e.message); return 0; }
    return enriched.length;
  }

  /**
   * Revert a list of pixels to default white IN MEMORY ONLY.
   * DB is NOT touched — unconfirmed pixels were never persisted, so there's
   * nothing to delete. Touching DB here would risk wiping a different user's
   * legitimately-confirmed pixel at the same coordinates.
   */
  /**
   * Wipe the entire canvas back to DEFAULT_PIXEL_COLOR in memory AND in the
   * SQLite store. Called by the epoch-poller in server.js when it detects
   * the on-chain epoch has incremented — each new epoch begins blank.
   */
  clearAll() {
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        this.grid[y][x] = DEFAULT_PIXEL_COLOR;
      }
    }
    this.lastModified = new Date();
    try { clearAllPixels(); }
    catch (e) { console.error('[pixelGrid.clearAll] DB wipe failed:', e.message); }
    console.log('🎬 Canvas cleared (memory + DB)');
  }

  revertPixels(pixels) {
    if (!Array.isArray(pixels) || pixels.length === 0) return [];
    const reverted = [];
    for (const { x, y } of pixels) {
      if (this.isValidCoordinate(x, y)) {
        this.grid[y][x] = DEFAULT_PIXEL_COLOR;
        reverted.push({ x, y, color: DEFAULT_PIXEL_COLOR });
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

  getCompressedGrid() {
    const flatGrid = this.grid.flat();
    const jsonString = JSON.stringify(flatGrid);
    return Buffer.from(jsonString).toString('base64');
  }

  loadCompressedGrid(compressedData) {
    try {
      const jsonString = Buffer.from(compressedData, 'base64').toString();
      const flatGrid = JSON.parse(jsonString);

      // Reshape flat array into 2D grid
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

// Create singleton instance
const pixelGrid = new PixelGrid();

export default pixelGrid;

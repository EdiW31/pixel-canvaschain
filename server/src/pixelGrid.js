import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_PIXEL_COLOR } from './constants.js';
import { loadAllPixels, savePixel as dbSavePixel, savePixels as dbSavePixels, pixelCount, clearAllPixels } from './db.js';

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

    // Mirror grid containing only DB-confirmed (on-chain-paid-for) pixels.
    // Served on canvas:request so reconnecting clients don't see ghost pixels
    // from unconfirmed/failed paintPixels transactions.
    this.confirmedGrid = Array(CANVAS_HEIGHT)
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
    // Errors here intentionally propagate to the server bootstrap so we
    // don't silently start with an empty canvas — see server.js boot block.
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

  /**
   * Returns the grid containing ONLY pixels confirmed on-chain (i.e. persisted
   * to SQLite via persistPixels()). Used for canvas:request so refreshed clients
   * never see pixels from a failed or in-flight paintPixels transaction.
   */
  getConfirmedGrid() {
    return this.confirmedGrid;
  }

  // Gets the color of a specific pixel
  getPixel(x, y) {
    if (!this.isValidCoordinate(x, y)) {
      return null;
    }
    return this.grid[y][x];
  }

  /**
   * Set a single pixel's color. Writes to in-memory grid AND SQLite immediately
   * so the pixel survives a server restart. DB errors are logged but don't fail
   * the paint (in-memory state still updates and broadcasts).
   */
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

  /**
   * Validate and apply a batch of pixels. Writes to in-memory grid AND SQLite
   * immediately so pixels survive a server restart without requiring ESDT tx
   * confirmation. The blockchain still enforces token payment for ownership;
   * the DB is the canvas display source of truth.
   */
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
    // Persist immediately so pixels survive restart.
    // DB errors are logged but do NOT abort the paint — in-memory state is
    // still updated so the broadcast goes out to all connected clients.
    try {
      dbSavePixels(enriched);
      for (const p of enriched) this.confirmedGrid[p.y][p.x] = p.color;
    } catch (e) {
      console.error('[setPixelsBatch] DB write failed (pixel in memory only):', e?.message ?? e);
    }
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
    const skipped = [];
    for (const p of pixels) {
      if (this.isValidCoordinate(p.x, p.y) && this.isValidColor(p.color)) {
        enriched.push({ x: p.x, y: p.y, color: p.color, address });
      } else {
        skipped.push(p);
      }
    }
    if (skipped.length > 0) {
      // Loud warning: if we're getting here, an upstream call is sending
      // colorless or otherwise malformed pixel records. The old code
      // silently swallowed these as "0 written" with no diagnostic.
      console.warn(
        `[persistPixels] skipped ${skipped.length}/${pixels.length} invalid records`,
        JSON.stringify(skipped.slice(0, 3)),
      );
    }
    if (enriched.length === 0) return 0;

    // DB write is the atomicity boundary. better-sqlite3 is synchronous, so
    // either it returns cleanly or throws. We do NOT swallow the error here —
    // the caller (server.js handlers) gets to decide whether to alert/rollback.
    // Previously a silent catch returned 0, leaving confirmedGrid stale and
    // future reconnecting clients seeing wrong state.
    try {
      dbSavePixels(enriched);
    } catch (e) {
      console.error('[persistPixels] DB write failed:', e?.message ?? e);
      console.error('[persistPixels] sample row:', JSON.stringify(enriched[0]));
      throw e;
    }

    // Only after DB write succeeds: mirror into confirmedGrid (canonical
    // truth served on reconnect) AND the live grid (for currently-connected
    // clients that may have missed the broadcast).
    for (const p of enriched) {
      this.confirmedGrid[p.y][p.x] = p.color;
      this.grid[p.y][p.x] = p.color;
    }
    this.lastModified = new Date();
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
        this.confirmedGrid[y][x] = DEFAULT_PIXEL_COLOR;
      }
    }
    this.lastModified = new Date();
    try { clearAllPixels(); }
    catch (e) { console.error('[pixelGrid.clearAll] DB wipe failed:', e.message); }
    console.log('🎬 Canvas cleared (memory + DB)');
  }

  /**
   * Revert a list of optimistic pixels back to their CONFIRMED color (the
   * color stored in DB, or white if never confirmed). This prevents wiping
   * another user's confirmed pixel at the same coords when an unrelated
   * paintPixels tx fails.
   */
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

  /**
   * Same as getRawRgbaBytes but pulls from confirmedGrid — i.e. only
   * pixels that have actually been persisted to SQLite (= paid for
   * on-chain). Used by the per-epoch snapshot endpoint so that the
   * frozen NFT image is the on-chain truth: optimistic-painted
   * unconfirmed pixels can NEVER bleed into an epoch's NFT artwork.
   */
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

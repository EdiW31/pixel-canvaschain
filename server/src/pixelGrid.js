import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_PIXEL_COLOR } from './constants.js';

/**
 * PixelGrid - Manages the 300x300 pixel canvas state
 *
 * Canvas size is defined in constants.js (CANVAS_SIZE).
 * In Phase 1, this is stored in memory (volatile).
 * [FUTURE: Phase 2 will add persistent storage (PostgreSQL/MongoDB)]
 * [FUTURE: Phase 3 will add IPFS snapshot uploads every 10 minutes]
 * [FUTURE: Phase 4 will commit IPFS hash to MultiversX Smart Contract]
 */

class PixelGrid {
  constructor() {
    this.grid = Array(CANVAS_HEIGHT)
      .fill(null)
      .map(() => Array(CANVAS_WIDTH).fill(DEFAULT_PIXEL_COLOR));

    this.lastModified = new Date();
    console.log(`✅ Pixel grid initialized: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
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

  // Sets the color of a specific pixel
  setPixel(x, y, color) {
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

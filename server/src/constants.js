// Tiered credit-purchase model. Each higher tier grants bonus pixels.
export const TIERS = [
  {
    name: 'Novice',
    cost: 10,           // EGLD
    basePixels: 1000,
    bonusPixels: 0,
    total: 1000,
    bonusPercent: 0,
    color: '#3b82f6',
  },
  {
    name: 'Apprentice',
    cost: 50,
    basePixels: 5000,
    bonusPixels: 500,
    total: 5500,
    bonusPercent: 10,
    color: '#00ffff',
  },
  {
    name: 'Artisan',
    cost: 100,
    basePixels: 10000,
    bonusPixels: 2000,
    total: 12000,
    bonusPercent: 20,
    color: '#a855f7',
  },
  {
    name: 'Master',
    cost: 500,
    basePixels: 50000,
    bonusPixels: 15000,
    total: 65000,
    bonusPercent: 30,
    color: '#fbbf24',
  },
  {
    name: 'Legend',
    cost: 1000,
    basePixels: 100000,
    bonusPixels: 50000,
    total: 150000,
    bonusPercent: 50,
    color: 'linear-gradient(to right, #ff00ff, #00ffff, #ffff00)',
    badge: 'Best Value'
  }
];

export const INITIAL_EGLD = 100;
export const INITIAL_CREDITS = 0;
export const DEFAULT_PIXEL_COLOR = '#FFFFFF';

// Canvas dimensions (single source of truth).
export const CANVAS_SIZE = 100;
export const CANVAS_WIDTH = CANVAS_SIZE;
export const CANVAS_HEIGHT = CANVAS_SIZE;

export const COST_PER_PIXEL = 1;

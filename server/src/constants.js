/**
 * Tier definitions for credit purchase system
 * Based on the tiered pricing model from the README
 *
 * Each tier offers bonus pixels as an incentive:
 * - Novice: Baseline (no bonus)
 * - Apprentice: +10% bonus
 * - Artisan: +20% bonus
 * - Master: +30% bonus
 * - Legend: +50% bonus
 *
 * [FUTURE: These tiers will be defined in the Smart Contract]
 * [FUTURE: Prices will be dynamically fetched from on-chain state]
 */

export const TIERS = [
  {
    name: 'Novice',
    cost: 10,           // Cost in EGLD
    basePixels: 1000,   // Base credits
    bonusPixels: 0,     // Bonus credits
    total: 1000,        // Total credits received
    bonusPercent: 0,    // Bonus percentage
    color: '#3b82f6',   // Blue (Tailwind blue-500)
  },
  {
    name: 'Apprentice',
    cost: 50,
    basePixels: 5000,
    bonusPixels: 500,
    total: 5500,
    bonusPercent: 10,
    color: '#00ffff',   // Cyan neon
  },
  {
    name: 'Artisan',
    cost: 100,
    basePixels: 10000,
    bonusPixels: 2000,
    total: 12000,
    bonusPercent: 20,
    color: '#a855f7',   // Purple (Tailwind purple-500)
  },
  {
    name: 'Master',
    cost: 500,
    basePixels: 50000,
    bonusPixels: 15000,
    total: 65000,
    bonusPercent: 30,
    color: '#fbbf24',   // Gold (Tailwind amber-400)
  },
  {
    name: 'Legend',
    cost: 1000,
    basePixels: 100000,
    bonusPixels: 50000,
    total: 150000,
    bonusPercent: 50,
    color: 'linear-gradient(to right, #ff00ff, #00ffff, #ffff00)', // Rainbow
    badge: 'Best Value'
  }
];

/**
 * Initial wallet balance for mock users
 * [FUTURE: Will be fetched from MultiversX blockchain via wallet address query]
 */
export const INITIAL_EGLD = 100;

/**
 * Initial credits balance for new users
 */
export const INITIAL_CREDITS = 0;

/**
 * Default canvas pixel color (white)
 */
export const DEFAULT_PIXEL_COLOR = '#FFFFFF';

/**
 * Canvas dimensions (single source of truth)
 */
export const CANVAS_SIZE = 100;
export const CANVAS_WIDTH = CANVAS_SIZE;
export const CANVAS_HEIGHT = CANVAS_SIZE;

/**
 * Credit cost per pixel
 */
export const COST_PER_PIXEL = 1;

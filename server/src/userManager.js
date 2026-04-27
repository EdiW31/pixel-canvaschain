import { INITIAL_EGLD, INITIAL_CREDITS, COST_PER_PIXEL, MAX_PIXELS_PER_SECOND } from './constants.js';

/**
 * UserManager - Manages user wallet balances and rate limiting
 *
 * In Phase 1, balances are stored in memory (volatile).
 * [FUTURE: Phase 2 will query real balances from MultiversX blockchain]
 * [FUTURE: Credits will be tracked on-chain via Smart Contract]
 * [FUTURE: Rate limiting will use Redis for distributed systems]
 */

class UserManager {
  constructor() {
    // Map of wallet address to user data
    // Structure: { address: { egld, credits, paintHistory: [] } }
    this.users = new Map();
    console.log('✅ User manager initialized');
  }

  /**
   * Create a new user with initial balances
   * @param {string} address - Wallet address (erd1...)
   * @returns {Object} User data
   */
  createUser(address) {
    if (this.users.has(address)) {
      console.warn(`⚠️  User ${address} already exists`);
      return this.users.get(address);
    }

    const userData = {
      address,
      egld: INITIAL_EGLD,
      credits: INITIAL_CREDITS,
      paintHistory: [], // Array of { timestamp, x, y, color }
      createdAt: new Date(),
    };

    this.users.set(address, userData);
    console.log(`✅ Created user: ${address} | ${INITIAL_EGLD} EGLD | ${INITIAL_CREDITS} Credits`);
    return userData;
  }

  /**
   * Get user data by address
   * @param {string} address - Wallet address
   * @returns {Object|null} User data or null if not found
   */
  getUser(address) {
    return this.users.get(address) || null;
  }

  /**
   * Check if user exists
   * @param {string} address - Wallet address
   * @returns {boolean}
   */
  hasUser(address) {
    return this.users.has(address);
  }

  /**
   * Get user's EGLD balance
   * [FUTURE: Query from MultiversX blockchain via API]
   * @param {string} address - Wallet address
   * @returns {number} EGLD balance
   */
  getEgldBalance(address) {
    const user = this.users.get(address);
    return user ? user.egld : 0;
  }

  /**
   * Get user's credit balance
   * [FUTURE: Query from Smart Contract]
   * @param {string} address - Wallet address
   * @returns {number} Credit balance
   */
  getCreditBalance(address) {
    const user = this.users.get(address);
    return user ? user.credits : 0;
  }

  /**
   * Purchase credits (deduct EGLD, add credits)
   * [FUTURE: This will trigger a Smart Contract transaction]
   * [FUTURE: Transaction will be signed by user's wallet]
   * [FUTURE: Smart Contract will handle the 25/25/50 revenue split]
   * @param {string} address - Wallet address
   * @param {number} cost - Cost in EGLD
   * @param {number} credits - Credits to add
   * @returns {Object} { success, egld, credits, message }
   */
  purchaseCredits(address, cost, credits) {
    const user = this.users.get(address);

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (user.egld < cost) {
      return {
        success: false,
        message: `Insufficient EGLD. Have: ${user.egld}, Need: ${cost}`,
      };
    }

    // Deduct EGLD and add credits
    user.egld -= cost;
    user.credits += credits;

    console.log(`💳 Purchase: ${address} | -${cost} EGLD | +${credits} Credits`);

    return {
      success: true,
      egld: user.egld,
      credits: user.credits,
      message: `Successfully purchased ${credits} credits!`,
    };
  }

  /**
   * Deduct credits for pixel painting
   * @param {string} address - Wallet address
   * @param {number} amount - Credits to deduct (default: 1)
   * @returns {Object} { success, credits, message }
   */
  deductCredits(address, amount = COST_PER_PIXEL) {
    const user = this.users.get(address);

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (user.credits < amount) {
      return {
        success: false,
        credits: user.credits,
        message: `Insufficient credits. Have: ${user.credits}, Need: ${amount}`,
      };
    }

    user.credits -= amount;

    return {
      success: true,
      credits: user.credits,
      message: `Deducted ${amount} credit(s)`,
    };
  }

  /**
   * Record pixel paint action (for rate limiting and history)
   * @param {string} address - Wallet address
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} color - Hex color
   */
  recordPaint(address, x, y, color) {
    const user = this.users.get(address);
    if (!user) return;

    user.paintHistory.push({
      timestamp: Date.now(),
      x,
      y,
      color,
    });

    // Keep only last 100 paint actions per user (memory optimization)
    if (user.paintHistory.length > 100) {
      user.paintHistory.shift();
    }
  }

  /**
   * Check if user is rate limited
   * @param {string} address - Wallet address
   * @returns {boolean} True if rate limited, false if allowed
   */
  isRateLimited(address) {
    const user = this.users.get(address);
    if (!user || !user.paintHistory.length) return false;

    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Count paints in last second
    const recentPaints = user.paintHistory.filter(
      (paint) => paint.timestamp > oneSecondAgo
    );

    return recentPaints.length >= MAX_PIXELS_PER_SECOND;
  }

  /**
   * Get user statistics
   * @param {string} address - Wallet address
   * @returns {Object|null} User stats
   */
  getUserStats(address) {
    const user = this.users.get(address);
    if (!user) return null;

    return {
      address: user.address,
      egld: user.egld,
      credits: user.credits,
      totalPainted: user.paintHistory.length,
      createdAt: user.createdAt,
    };
  }

  /**
   * Get all users (for admin/debug)
   * @returns {Array<Object>} Array of user data
   */
  getAllUsers() {
    return Array.from(this.users.values());
  }

  /**
   * Get total number of users
   * @returns {number}
   */
  getUserCount() {
    return this.users.size;
  }

  /**
   * Remove user (for cleanup)
   * @param {string} address - Wallet address
   */
  removeUser(address) {
    const deleted = this.users.delete(address);
    if (deleted) {
      console.log(`🗑️  Removed user: ${address}`);
    }
    return deleted;
  }
}

// Create singleton instance
const userManager = new UserManager();

export default userManager;

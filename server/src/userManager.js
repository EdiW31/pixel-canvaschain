import { MAX_PIXELS_PER_SECOND, COST_PER_PIXEL } from './constants.js';

/**
 * UserManager — Session-level wallet and credit tracking (Phase 2)
 *
 * Credits are seeded from the on-chain balance when the user joins.
 * Decrements are local (fast, no gas).  The frontend polls the chain
 * independently via useContractCredits to show the real on-chain balance.
 *
 * The server does NOT call consumeCredits on-chain — no gas is spent
 * server-side.  The on-chain balance decreases only when new purchases
 * are made (buyPixels endpoint called by the user's own wallet).
 */

class UserManager {
  constructor() {
    // Map<address, { address, credits, paintHistory, joinedAt }>
    this.users = new Map();
    console.log('✅ User manager initialized');
  }

  /**
   * Register or refresh a wallet for the current socket session.
   * Called on wallet:join with credits fetched from the chain.
   *
   * @param {string} address  - bech32 wallet address (erd1...)
   * @param {number} onChainCredits - credit balance read from smart contract
   * @returns {Object} session user data
   */
  joinUser(address, onChainCredits) {
    const existing = this.users.get(address);

    if (existing) {
      // Refresh credit balance from chain (in case they bought more since last session)
      existing.credits = onChainCredits;
      existing.joinedAt = new Date();
      console.log(`🔄 User rejoined: ${address.slice(0, 10)}... | ${onChainCredits} credits`);
      return existing;
    }

    const userData = {
      address,
      credits: onChainCredits,
      paintHistory: [],
      joinedAt: new Date(),
    };

    this.users.set(address, userData);
    console.log(`✅ User joined: ${address.slice(0, 10)}... | ${onChainCredits} credits`);
    return userData;
  }

  /**
   * Get session data for a wallet address.
   * @param {string} address
   * @returns {Object|null}
   */
  getUser(address) {
    return this.users.get(address) || null;
  }

  /**
   * Check if user has an active session.
   * @param {string} address
   * @returns {boolean}
   */
  hasUser(address) {
    return this.users.has(address);
  }

  /**
   * Get current session credit balance.
   * @param {string} address
   * @returns {number}
   */
  getCreditBalance(address) {
    return this.users.get(address)?.credits ?? 0;
  }

  /**
   * Deduct credits from the session balance.
   * @param {string} address
   * @param {number} amount - defaults to COST_PER_PIXEL (1)
   * @returns {{ success: boolean, credits?: number, message?: string }}
   */
  deductCredits(address, amount = COST_PER_PIXEL) {
    const user = this.users.get(address);

    if (!user) {
      return { success: false, message: 'User not found. Please rejoin.' };
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
    };
  }

  /**
   * Record a paint action (for rate-limiting and history).
   * @param {string} address
   * @param {number} x
   * @param {number} y
   * @param {string} color
   */
  recordPaint(address, x, y, color) {
    const user = this.users.get(address);
    if (!user) return;

    user.paintHistory.push({ timestamp: Date.now(), x, y, color });

    // Keep only the last 100 actions
    if (user.paintHistory.length > 100) {
      user.paintHistory.shift();
    }
  }

  /**
   * Returns true if the user has exceeded the rate limit.
   * @param {string} address
   * @returns {boolean}
   */
  isRateLimited(address) {
    const user = this.users.get(address);
    if (!user || !user.paintHistory.length) return false;

    const now = Date.now();
    const recentPaints = user.paintHistory.filter((p) => p.timestamp > now - 1000);
    return recentPaints.length >= MAX_PIXELS_PER_SECOND;
  }

  /**
   * Get summary stats for a user.
   * @param {string} address
   * @returns {Object|null}
   */
  getUserStats(address) {
    const user = this.users.get(address);
    if (!user) return null;

    return {
      address: user.address,
      credits: user.credits,
      totalPainted: user.paintHistory.length,
      joinedAt: user.joinedAt,
    };
  }

  /**
   * Get all active session users.
   * @returns {Array<Object>}
   */
  getAllUsers() {
    return Array.from(this.users.values());
  }

  /**
   * Total number of active sessions.
   * @returns {number}
   */
  getUserCount() {
    return this.users.size;
  }

  /**
   * Remove a user session (e.g. on disconnect / cleanup).
   * @param {string} address
   * @returns {boolean}
   */
  removeUser(address) {
    const deleted = this.users.delete(address);
    if (deleted) console.log(`🗑️  Removed session: ${address.slice(0, 10)}...`);
    return deleted;
  }
}

const userManager = new UserManager();
export default userManager;

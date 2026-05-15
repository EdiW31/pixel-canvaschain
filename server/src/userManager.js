import { MAX_PIXELS_PER_SECOND } from './constants.js';

class UserManager {
  constructor() {
    // Map<address, { address, paintHistory, joinedAt }>
    this.users = new Map();
    console.log('✅ User manager initialized');
  }

  /**
   * Register or refresh a wallet session.
   */
  joinUser(address) {
    const existing = this.users.get(address);
    if (existing) {
      existing.joinedAt = new Date();
      console.log(`🔄 User rejoined: ${address.slice(0, 10)}...`);
      return existing;
    }

    const userData = { address, paintHistory: [], joinedAt: new Date() };
    this.users.set(address, userData);
    console.log(`✅ User joined: ${address.slice(0, 10)}...`);
    return userData;
  }

  getUser(address) {
    return this.users.get(address) || null;
  }

  hasUser(address) {
    return this.users.has(address);
  }

  /**
   * Record a paint action for rate-limiting.
   */
  recordPaint(address, x, y, color) {
    const user = this.users.get(address);
    if (!user) return;
    user.paintHistory.push({ timestamp: Date.now(), x, y, color });
    if (user.paintHistory.length > 100) user.paintHistory.shift();
  }

  /**
   * Returns true if the user has exceeded the pixel-per-second rate limit.
   */
  isRateLimited(address) {
    const user = this.users.get(address);
    if (!user || !user.paintHistory.length) return false;
    const now = Date.now();
    const recentPaints = user.paintHistory.filter((p) => p.timestamp > now - 1000);
    return recentPaints.length >= MAX_PIXELS_PER_SECOND;
  }

  getUserStats(address) {
    const user = this.users.get(address);
    if (!user) return null;
    return {
      address: user.address,
      totalPainted: user.paintHistory.length,
      joinedAt: user.joinedAt,
    };
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  getUserCount() {
    return this.users.size;
  }

  removeUser(address) {
    const deleted = this.users.delete(address);
    if (deleted) console.log(`🗑️  Removed session: ${address.slice(0, 10)}...`);
    return deleted;
  }
}

const userManager = new UserManager();
export default userManager;

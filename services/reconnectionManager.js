import { logger } from '../utils/logger.js';

class ReconnectionManager {
  constructor() {
    // Track disconnected players: { userId: { gameData, timestamp, socketId } }
    this.disconnectedPlayers = new Map();
    this.GRACE_PERIOD_MS = 90000; // 90 seconds grace period
    this.CLEANUP_INTERVAL_MS = 30000; // Cleanup every 30 seconds

    this.startCleanupTask();
  }

  /**
   * Mark a player as disconnected (start grace period)
   */
  markDisconnected(userId, gameData) {
    this.disconnectedPlayers.set(userId, {
      gameData,
      timestamp: Date.now(),
      socketId: gameData.socketId
    });

    logger.info(`Player ${userId} marked as disconnected. Grace period: ${this.GRACE_PERIOD_MS}ms`);

    // Schedule removal after grace period
    setTimeout(() => {
      const entry = this.disconnectedPlayers.get(userId);
      if (entry && Date.now() - entry.timestamp >= this.GRACE_PERIOD_MS) {
        this.disconnectedPlayers.delete(userId);
        logger.info(`Player ${userId} grace period expired`);
      }
    }, this.GRACE_PERIOD_MS);
  }

  /**
   * Check if a player can reconnect (within grace period)
   */
  canReconnect(userId) {
    const entry = this.disconnectedPlayers.get(userId);
    if (!entry) {
      return false;
    }

    const timeSinceDisconnect = Date.now() - entry.timestamp;
    return timeSinceDisconnect < this.GRACE_PERIOD_MS;
  }

  /**
   * Get player's previous game data for reconnection
   */
  getReconnectionData(userId) {
    const entry = this.disconnectedPlayers.get(userId);
    if (!entry) {
      return null;
    }

    return entry.gameData;
  }

  /**
   * Clear a disconnected player entry (successful reconnect or expired)
   */
  clearDisconnected(userId) {
    this.disconnectedPlayers.delete(userId);
    logger.info(`Player ${userId} cleared from disconnected list`);
  }

  /**
   * Get remaining grace period for a player
   */
  getRemainingGracePeriod(userId) {
    const entry = this.disconnectedPlayers.get(userId);
    if (!entry) {
      return 0;
    }

    const remaining = this.GRACE_PERIOD_MS - (Date.now() - entry.timestamp);
    return Math.max(0, remaining);
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startCleanupTask() {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [userId, entry] of this.disconnectedPlayers.entries()) {
        if (now - entry.timestamp >= this.GRACE_PERIOD_MS) {
          this.disconnectedPlayers.delete(userId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired disconnected players`);
      }
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Get all currently disconnected players
   */
  getDisconnectedPlayers() {
    const result = [];
    for (const [userId, entry] of this.disconnectedPlayers.entries()) {
      result.push({
        userId,
        socketId: entry.socketId,
        timestamp: entry.timestamp,
        remainingMs: this.getRemainingGracePeriod(userId)
      });
    }
    return result;
  }
}

export const reconnectionManager = new ReconnectionManager();

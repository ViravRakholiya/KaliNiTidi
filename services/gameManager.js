import { logger } from '../utils/logger.js';
import { gameEngine } from '../engine/gameEngine.js';

class GameManager {
  constructor() {
    this.games = new Map();
  }

  async createGame(ownerId, options = {}) {
    const game = {
      id: this.generateGameId(),
      ownerId,
      name: options.name || `Game ${Date.now()}`,
      maxPlayers: options.maxPlayers || 4,
      status: 'waiting',
      players: [],
      createdAt: new Date().toISOString(),
      settings: options.settings || {}
    };

    this.games.set(game.id, game);
    return game;
  }

  async joinGame(gameId, userId, socketId) {
    const game = this.games.get(gameId);

    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.status !== 'waiting') {
      return { success: false, message: 'Game already started' };
    }

    if (game.players.length >= game.maxPlayers) {
      return { success: false, message: 'Game is full' };
    }

    if (game.players.find(p => p.userId === userId)) {
      return { success: false, message: 'Already in game' };
    }

    const player = {
      userId,
      socketId,
      joinedAt: new Date().toISOString(),
      hand: [],
      score: 0
    };

    game.players.push(player);
    return { success: true, game, player };
  }

  async leaveGame(gameId, userId) {
    const game = this.games.get(gameId);

    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    const playerIndex = game.players.findIndex(p => p.userId === userId);

    if (playerIndex === -1) {
      return { success: false, message: 'Not in game' };
    }

    game.players.splice(playerIndex, 1);

    if (game.players.length === 0) {
      this.games.delete(gameId);
      logger.info(`Game ${gameId} deleted (no players)`);
    } else if (game.ownerId === userId && game.players.length > 0) {
      game.ownerId = game.players[0].userId;
    }

    return { success: true, game };
  }

  async startGame(gameId, userId) {
    const game = this.games.get(gameId);

    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.ownerId !== userId) {
      return { success: false, message: 'Only owner can start game' };
    }

    if (game.players.length < 2) {
      return { success: false, message: 'Need at least 2 players' };
    }

    game.status = 'playing';
    game.startedAt = new Date().toISOString();

    const gameState = gameEngine.initialize(game);

    return { success: true, game: gameState };
  }

  async playCard(gameId, userId, cardId) {
    const game = this.games.get(gameId);

    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.status !== 'playing') {
      return { success: false, message: 'Game not in progress' };
    }

    const result = gameEngine.playCard(game, userId, cardId);
    return result;
  }

  getGame(gameId) {
    return this.games.get(gameId);
  }

  generateGameId() {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const gameManager = new GameManager();

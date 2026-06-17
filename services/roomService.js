import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

class RoomService {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Fill in / clamp the host-chosen game settings with sane defaults.
   */
  normalizeConfig(cfg = {}) {
    const num = (v, d) => (typeof v === 'number' && !isNaN(v) ? v : d);
    return {
      numberOfDecks: Math.max(1, Math.min(8, num(cfg.numberOfDecks, 2))),
      cardsPerPlayer: Math.max(1, Math.min(52, num(cfg.cardsPerPlayer, 13))),
      minimumBid: Math.max(0, num(cfg.minimumBid, 250)),
      basePartners: Math.max(0, Math.min(10, num(cfg.basePartners, 1))),
      pointsPerExtraPartner: Math.max(0, num(cfg.pointsPerExtraPartner, 250)),
      maxPartners: cfg.maxPartners != null ? Math.max(1, num(cfg.maxPartners, 0)) : null
    };
  }

  /**
   * Validate the game settings. The minimum bid and the extra-partner threshold
   * can never exceed the total points in the deck (250 × decks) — those points
   * don't exist, so such a room makes no sense.
   */
  validateConfig(cfg = {}) {
    const c = this.normalizeConfig(cfg);
    const totalPoints = 250 * c.numberOfDecks;
    const errors = [];
    if (c.minimumBid > totalPoints) {
      errors.push(`Minimum bid (${c.minimumBid}) can't exceed the deck's total points (${totalPoints}).`);
    }
    if (c.pointsPerExtraPartner > totalPoints) {
      errors.push(`Extra-partner threshold (${c.pointsPerExtraPartner}) can't exceed the deck's total points (${totalPoints}).`);
    }
    return { valid: errors.length === 0, errors, totalPoints };
  }

  /**
   * Update a room's config (host only; while waiting between rounds).
   */
  updateConfig(roomId, cfg) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
    const merged = { ...room.config, ...cfg };
    const v = this.validateConfig(merged);
    if (!v.valid) return { success: false, error: 'INVALID_CONFIG', message: v.errors.join(' ') };
    room.config = this.normalizeConfig(merged);
    return { success: true, config: room.config };
  }

  generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomId = '';
    for (let i = 0; i < 6; i++) {
      roomId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return roomId;
  }

  createRoom(hostSocketId, hostName, options = {}) {
    const roomId = this.generateRoomId();

    const hostPlayer = {
      socketId: hostSocketId,
      playerId: options.playerId || randomUUID(),
      name: hostName,
      isHost: true,
      connected: true,
      isBot: false,
      waiting: false
    };

    const room = {
      roomId,
      hostId: hostSocketId,
      players: [hostPlayer],
      maxPlayers: options.maxPlayers || 4,
      status: 'waiting',
      createdAt: new Date().toISOString(),
      // Host-configured game settings (fixed for the session, see RULES.md §2)
      config: this.normalizeConfig(options.config)
    };

    this.rooms.set(roomId, room);
    logger.info(`Room created: ${roomId} by host ${hostSocketId}`);

    return {
      success: true,
      room
    };
  }

  joinRoom(roomId, socketId, playerName, playerId = null) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return {
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: 'Room does not exist'
      };
    }

    // The "max players" set at creation is a soft size, not a hard cap — more
    // people can still join (the table auto-grows) up to a sane hard limit.
    const HARD_MAX = 16;
    if (room.players.length >= HARD_MAX) {
      return {
        success: false,
        error: 'ROOM_FULL',
        message: `Room is full (max ${HARD_MAX})`
      };
    }
    if (room.players.length >= room.maxPlayers) {
      room.maxPlayers = room.players.length + 1; // grow to fit the newcomer
    }

    const existingPlayer = this.findPlayerBySocketId(room, socketId);
    if (existingPlayer) {
      return {
        success: false,
        error: 'ALREADY_IN_ROOM',
        message: 'Player is already in this room'
      };
    }

    // Joining a room with a round in progress is allowed: the player is seated
    // as "waiting" and is dealt in when the next round starts.
    const joinDuringGame = room.status === 'playing';

    const newPlayer = {
      socketId,
      playerId: playerId || randomUUID(),
      name: playerName,
      isHost: false,
      connected: true,
      isBot: false,
      waiting: joinDuringGame
    };

    room.players.push(newPlayer);
    logger.info(`Player ${socketId} (${playerName}) joined room ${roomId}${joinDuringGame ? ' (waiting for next round)' : ''}`);

    return {
      success: true,
      room,
      player: newPlayer,
      waitingForNextRound: joinDuringGame
    };
  }

  /**
   * Add a bot player to a room (host-only convenience for testing / filling
   * seats). Bots have a synthetic socketId and are driven by the server.
   */
  addBot(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
    if (room.players.length >= 16) {
      return { success: false, error: 'ROOM_FULL', message: 'Room is full (max 16)' };
    }
    if (room.players.length >= room.maxPlayers) {
      room.maxPlayers = room.players.length + 1; // grow to fit the bot
    }

    const botNum = room.players.filter(p => p.isBot).length + 1;
    const id = 'bot_' + randomUUID();
    const bot = {
      socketId: id,
      playerId: id,
      name: `Bot ${botNum}`,
      isHost: false,
      connected: true,
      isBot: true,
      waiting: room.status === 'playing'
    };
    room.players.push(bot);
    logger.info(`Bot ${bot.name} added to room ${roomId}`);
    return { success: true, room, player: bot };
  }

  /**
   * Remove the most recently added bot from a room.
   */
  removeBot(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
    for (let i = room.players.length - 1; i >= 0; i--) {
      if (room.players[i].isBot) {
        const [bot] = room.players.splice(i, 1);
        logger.info(`Bot ${bot.name} removed from room ${roomId}`);
        return { success: true, room, player: bot };
      }
    }
    return { success: false, error: 'NO_BOTS', message: 'No bots to remove' };
  }

  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return {
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: 'Room does not exist'
      };
    }

    const playerIndex = room.players.findIndex(p => p.socketId === socketId);

    if (playerIndex === -1) {
      return {
        success: false,
        error: 'PLAYER_NOT_IN_ROOM',
        message: 'Player is not in this room'
      };
    }

    const leavingPlayer = room.players[playerIndex];
    const wasHost = leavingPlayer.isHost;

    room.players.splice(playerIndex, 1);

    let newHostId = null;

    // A room with no human players left (e.g. only bots) is treated as empty.
    const humansLeft = room.players.some(p => !p.isBot);

    if (room.players.length === 0 || !humansLeft) {
      this.rooms.delete(roomId);
      logger.info(`Room ${roomId} deleted (${room.players.length === 0 ? 'no players remaining' : 'only bots left'})`);
      return {
        success: true,
        room: null,
        leavingPlayer,
        newHostId: null,
        roomEmpty: true
      };
    }

    if (wasHost) {
      // Promote the first human player to host (never a bot)
      const newHost = room.players.find(p => !p.isBot) || room.players[0];
      newHost.isHost = true;
      newHostId = newHost.socketId;
      room.hostId = newHostId;
      logger.info(`New host assigned for room ${roomId}: ${newHostId}`);
    }

    logger.info(`Player ${socketId} left room ${roomId}`);

    return {
      success: true,
      room,
      leavingPlayer,
      newHostId,
      roomEmpty: false
    };
  }

  getRoomState(roomId) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return {
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: 'Room does not exist'
      };
    }

    return {
      success: true,
      roomState: {
        roomId: room.roomId,
        hostId: room.hostId,
        players: room.players.map(p => ({
          socketId: p.socketId,
          name: p.name,
          isHost: p.isHost,
          connected: p.connected !== false,
          isBot: !!p.isBot,
          waiting: !!p.waiting
        })),
        maxPlayers: room.maxPlayers,
        status: room.status,
        playerCount: room.players.length,
        config: room.config
      }
    };
  }

  updateRoomStatus(roomId, status) {
    const room = this.rooms.get(roomId);

    if (!room) {
      return {
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: 'Room does not exist'
      };
    }

    const validStatuses = ['waiting', 'playing', 'completed'];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: 'INVALID_STATUS',
        message: 'Invalid room status'
      };
    }

    room.status = status;
    logger.info(`Room ${roomId} status updated to: ${status}`);

    return {
      success: true,
      room
    };
  }

  findPlayerBySocketId(room, socketId) {
    return room.players.find(p => p.socketId === socketId);
  }

  findRoomBySocketId(socketId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (this.findPlayerBySocketId(room, socketId)) {
        return roomId;
      }
    }
    return null;
  }

  findPlayerByPlayerId(room, playerId) {
    return room.players.find(p => p.playerId === playerId);
  }

  findRoomByPlayerId(playerId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (this.findPlayerByPlayerId(room, playerId)) {
        return roomId;
      }
    }
    return null;
  }

  /**
   * Mark a player as temporarily disconnected (kept in the room during the
   * reconnection grace period instead of being removed immediately).
   */
  markDisconnected(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = this.findPlayerBySocketId(room, socketId);
    if (!player) return null;

    player.connected = false;
    logger.info(`Player ${player.name} (${player.playerId}) marked as disconnected in room ${roomId}`);
    return { room, player };
  }

  /**
   * Rebind a returning player's stable playerId to a fresh socket id.
   * Updates host references and cumulative score keys so the rest of the
   * game state can keep using socketId as its runtime key.
   */
  rebindSocket(roomId, playerId, newSocketId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
    }

    const player = this.findPlayerByPlayerId(room, playerId);
    if (!player) {
      return { success: false, error: 'PLAYER_NOT_IN_ROOM', message: 'Player is not in this room' };
    }

    const oldSocketId = player.socketId;
    player.socketId = newSocketId;
    player.connected = true;

    if (room.hostId === oldSocketId) {
      room.hostId = newSocketId;
    }

    // Re-key cumulative scores if present
    if (room.cumulativeScores && oldSocketId in room.cumulativeScores) {
      room.cumulativeScores[newSocketId] = room.cumulativeScores[oldSocketId];
      delete room.cumulativeScores[oldSocketId];
    }

    logger.info(`Rebound player ${player.name} (${playerId}) from ${oldSocketId} to ${newSocketId} in room ${roomId}`);
    return { success: true, room, player, oldSocketId };
  }

  getAllRooms() {
    const roomsArray = [];
    for (const [roomId, room] of this.rooms.entries()) {
      roomsArray.push({
        roomId: room.roomId,
        hostId: room.hostId,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        status: room.status
      });
    }
    return roomsArray;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }
}

export const roomService = new RoomService();

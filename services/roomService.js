import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

class RoomService {
  constructor() {
    this.rooms = new Map();
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
      connected: true
    };

    const room = {
      roomId,
      hostId: hostSocketId,
      players: [hostPlayer],
      maxPlayers: options.maxPlayers || 4,
      status: 'waiting',
      createdAt: new Date().toISOString()
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

    if (room.status !== 'waiting') {
      return {
        success: false,
        error: 'ROOM_NOT_AVAILABLE',
        message: 'Room is not accepting new players'
      };
    }

    if (room.players.length >= room.maxPlayers) {
      return {
        success: false,
        error: 'ROOM_FULL',
        message: 'Room is full'
      };
    }

    const existingPlayer = this.findPlayerBySocketId(room, socketId);
    if (existingPlayer) {
      return {
        success: false,
        error: 'ALREADY_IN_ROOM',
        message: 'Player is already in this room'
      };
    }

    const newPlayer = {
      socketId,
      playerId: playerId || randomUUID(),
      name: playerName,
      isHost: false,
      connected: true
    };

    room.players.push(newPlayer);
    logger.info(`Player ${socketId} (${playerName}) joined room ${roomId}`);

    return {
      success: true,
      room,
      player: newPlayer
    };
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

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      logger.info(`Room ${roomId} deleted (no players remaining)`);
    } else if (wasHost) {
      const newHost = room.players[0];
      newHost.isHost = true;
      newHostId = newHost.socketId;
      room.hostId = newHostId;
      logger.info(`New host assigned for room ${roomId}: ${newHostId}`);
    }

    logger.info(`Player ${socketId} left room ${roomId}`);

    return {
      success: true,
      room: room.players.length > 0 ? room : null,
      leavingPlayer,
      newHostId,
      roomEmpty: room.players.length === 0
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
          connected: p.connected !== false
        })),
        maxPlayers: room.maxPlayers,
        status: room.status,
        playerCount: room.players.length
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

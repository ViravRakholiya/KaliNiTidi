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
      name: hostName,
      isHost: true
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

  joinRoom(roomId, socketId, playerName) {
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
      name: playerName,
      isHost: false
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
          isHost: p.isHost
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

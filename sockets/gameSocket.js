import { logger } from '../utils/logger.js';
import { roomService } from '../services/roomService.js';

export const handleGameSocket = (io, socket) => {
  socket.on('CREATE_ROOM', (data, callback) => {
    const { name, maxPlayers } = data;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const error = { success: false, error: 'INVALID_NAME', message: 'Player name is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (maxPlayers && (maxPlayers < 2 || maxPlayers > 10)) {
      const error = { success: false, error: 'INVALID_MAX_PLAYERS', message: 'Max players must be between 2 and 10' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.createRoom(socket.id, name.trim(), { maxPlayers });

    if (result.success) {
      socket.join(result.room.roomId);

      const response = {
        roomId: result.room.roomId,
        players: result.room.players,
        hostId: result.room.hostId,
        maxPlayers: result.room.maxPlayers,
        status: result.room.status
      };

      if (typeof callback === 'function') callback({ success: true, ...response });
      socket.emit('ROOM_CREATED', response);

      logger.info(`Socket ${socket.id} created and joined room ${result.room.roomId}`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('JOIN_ROOM', (data, callback) => {
    const { roomId, name } = data;

    if (!roomId || typeof roomId !== 'string') {
      const error = { success: false, error: 'INVALID_ROOM_ID', message: 'Room ID is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const error = { success: false, error: 'INVALID_NAME', message: 'Player name is required' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.joinRoom(roomId, socket.id, name.trim());

    if (result.success) {
      socket.join(roomId);

      const playerInfo = {
        socketId: result.player.socketId,
        name: result.player.name,
        isHost: result.player.isHost
      };

      const roomStateResponse = {
        roomId: result.room.roomId,
        players: result.room.players,
        hostId: result.room.hostId,
        maxPlayers: result.room.maxPlayers,
        status: result.room.status
      };

      if (typeof callback === 'function') callback({ success: true, ...roomStateResponse });
      socket.emit('ROOM_JOINED', roomStateResponse);

      socket.to(roomId).emit('PLAYER_JOINED', {
        player: playerInfo,
        playerCount: result.room.players.length
      });

      logger.info(`Socket ${socket.id} (${name}) joined room ${roomId}`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('LEAVE_ROOM', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.leaveRoom(roomId, socket.id);

    if (result.success) {
      socket.leave(roomId);

      const playerInfo = {
        socketId: result.leavingPlayer.socketId,
        name: result.leavingPlayer.name,
        wasHost: result.leavingPlayer.isHost
      };

      if (typeof callback === 'function') callback({ success: true });
      socket.emit('ROOM_LEFT', { roomId });

      if (!result.roomEmpty && result.room) {
        io.to(roomId).emit('PLAYER_LEFT', {
          player: playerInfo,
          playerCount: result.room.players.length,
          newHostId: result.newHostId
        });

        if (result.newHostId) {
          io.to(result.newHostId).emit('HOST_ASSIGNED', {
            roomId,
            hostId: result.newHostId
          });
        }
      }

      logger.info(`Socket ${socket.id} left room ${roomId}`);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('GET_ROOM_STATE', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const result = roomService.getRoomState(roomId);

    if (result.success) {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_STATE', result.roomState);
    } else {
      if (typeof callback === 'function') callback(result);
      socket.emit('ROOM_ERROR', result);
    }
  });

  socket.on('START_GAME', (data, callback) => {
    const roomId = data?.roomId || roomService.findRoomBySocketId(socket.id);

    if (!roomId) {
      const error = { success: false, error: 'NOT_IN_ROOM', message: 'Not in any room' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const room = roomService.getRoom(roomId);

    if (!room) {
      const error = { success: false, error: 'ROOM_NOT_FOUND', message: 'Room does not exist' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (room.hostId !== socket.id) {
      const error = { success: false, error: 'NOT_HOST', message: 'Only the host can start the game' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    if (room.players.length < 2) {
      const error = { success: false, error: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 2 players to start' };
      if (typeof callback === 'function') callback(error);
      socket.emit('ROOM_ERROR', error);
      return;
    }

    const updateResult = roomService.updateRoomStatus(roomId, 'playing');

    if (updateResult.success) {
      io.to(roomId).emit('GAME_STARTED', {
        roomId,
        players: updateResult.room.players
      });

      if (typeof callback === 'function') callback({ success: true });

      logger.info(`Game started in room ${roomId} by host ${socket.id}`);
    } else {
      if (typeof callback === 'function') callback(updateResult);
      socket.emit('ROOM_ERROR', updateResult);
    }
  });

  socket.on('disconnect', () => {
    const roomId = roomService.findRoomBySocketId(socket.id);

    if (roomId) {
      const result = roomService.leaveRoom(roomId, socket.id);

      if (result.success && !result.roomEmpty && result.room) {
        const playerInfo = {
          socketId: result.leavingPlayer.socketId,
          name: result.leavingPlayer.name,
          wasHost: result.leavingPlayer.isHost
        };

        io.to(roomId).emit('PLAYER_LEFT', {
          player: playerInfo,
          playerCount: result.room.players.length,
          newHostId: result.newHostId,
          disconnected: true
        });

        if (result.newHostId) {
          io.to(result.newHostId).emit('HOST_ASSIGNED', {
            roomId,
            hostId: result.newHostId
          });
        }
      }

      logger.info(`Socket ${socket.id} disconnected and left room ${roomId}`);
    }
  });

  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
};

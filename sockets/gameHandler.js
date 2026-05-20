import { logger } from '../utils/logger.js';
import { gameManager } from '../services/gameManager.js';
import { reconnectionManager } from '../services/reconnectionManager.js';

export const handleGameEvents = (io, socket) => {
  // Rejoin event - allow disconnected players to reconnect
  socket.on('game:rejoin', async (data) => {
    try {
      const { userId } = data;

      if (!userId) {
        socket.emit('game:error', { message: 'User ID required' });
        return;
      }

      // Check if player can reconnect (within grace period)
      if (!reconnectionManager.canReconnect(userId)) {
        socket.emit('game:rejoin_failed', {
          message: 'Reconnection period expired or player not found',
          canReconnect: false
        });
        logger.info(`Rejoin failed for user ${userId}: grace period expired`);
        return;
      }

      // Get previous game data
      const reconnectionData = reconnectionManager.getReconnectionData(userId);

      if (!reconnectionData) {
        socket.emit('game:rejoin_failed', {
          message: 'Reconnection data not found',
          canReconnect: false
        });
        return;
      }

      const { gameId } = reconnectionData;

      // Verify game still exists
      const game = gameManager.getGame(gameId);
      if (!game) {
        reconnectionManager.clearDisconnected(userId);
        socket.emit('game:rejoin_failed', {
          message: 'Game no longer exists',
          canReconnect: false
        });
        return;
      }

      // Update socket data
      socket.data.userId = userId;
      socket.data.gameId = gameId;

      // Rejoin socket room
      socket.join(`game:${gameId}`);

      // Update player's socketId in the game
      const player = game.players.find(p => p.userId === userId);
      if (player) {
        player.socketId = socket.id;
      }

      // Clear from disconnected list
      reconnectionManager.clearDisconnected(userId);

      // Notify all players about reconnection
      io.to(`game:${gameId}`).emit('player:reconnected', {
        userId,
        gameId,
        timestamp: new Date().toISOString()
      });

      // Send updated game state to reconnected player
      socket.emit('game:rejoined', {
        game,
        message: 'Successfully reconnected to the game'
      });

      logger.info(`User ${userId} reconnected to game ${gameId}`);
    } catch (error) {
      logger.error('Rejoin error:', error);
      socket.emit('game:error', { message: error.message });
    }
  });
  socket.on('game:create', async (data) => {
    try {
      const { userId } = socket.data;

      if (!userId) {
        socket.emit('game:error', { message: 'Authentication required' });
        return;
      }

      const game = await gameManager.createGame(userId, data);
      socket.join(`game:${game.id}`);

      socket.emit('game:created', game);
      logger.info(`Game created: ${game.id} by user ${userId}`);
    } catch (error) {
      logger.error('Game creation error:', error);
      socket.emit('game:error', { message: error.message });
    }
  });

  socket.on('game:join', async (data) => {
    try {
      const { gameId } = data;
      const { userId } = socket.data;

      if (!userId) {
        socket.emit('game:error', { message: 'Authentication required' });
        return;
      }

      const result = await gameManager.joinGame(gameId, userId, socket.id);

      if (result.success) {
        socket.join(`game:${gameId}`);
        socket.data.gameId = gameId;

        io.to(`game:${gameId}`).emit('game:player_joined', {
          gameId,
          player: result.player,
          playerCount: result.game.players.length
        });

        socket.emit('game:joined', result.game);
        logger.info(`User ${userId} joined game ${gameId}`);
      } else {
        socket.emit('game:error', { message: result.message });
      }
    } catch (error) {
      logger.error('Game join error:', error);
      socket.emit('game:error', { message: error.message });
    }
  });

  socket.on('game:leave', async () => {
    try {
      const { userId, gameId } = socket.data;

      if (!gameId) {
        socket.emit('game:error', { message: 'Not in a game' });
        return;
      }

      const result = await gameManager.leaveGame(gameId, userId);

      if (result.success) {
        socket.leave(`game:${gameId}`);
        socket.data.gameId = null;

        io.to(`game:${gameId}`).emit('game:player_left', {
          gameId,
          userId,
          playerCount: result.game.players.length
        });

        socket.emit('game:left');
        logger.info(`User ${userId} left game ${gameId}`);
      }
    } catch (error) {
      logger.error('Game leave error:', error);
      socket.emit('game:error', { message: error.message });
    }
  });

  socket.on('game:start', async () => {
    try {
      const { userId, gameId } = socket.data;

      if (!gameId) {
        socket.emit('game:error', { message: 'Not in a game' });
        return;
      }

      const result = await gameManager.startGame(gameId, userId);

      if (result.success) {
        io.to(`game:${gameId}`).emit('game:started', result.game);
        logger.info(`Game ${gameId} started by user ${userId}`);
      } else {
        socket.emit('game:error', { message: result.message });
      }
    } catch (error) {
      logger.error('Game start error:', error);
      socket.emit('game:error', { message: error.message });
    }
  });

  socket.on('game:play_card', async (data) => {
    try {
      const { cardId } = data;
      const { userId, gameId } = socket.data;

      if (!gameId) {
        socket.emit('game:error', { message: 'Not in a game' });
        return;
      }

      const result = await gameManager.playCard(gameId, userId, cardId);

      if (result.success) {
        io.to(`game:${gameId}`).emit('game:card_played', {
          gameId,
          userId,
          card: result.card,
          gameState: result.gameState
        });
      } else {
        socket.emit('game:error', { message: result.message });
      }
    } catch (error) {
      logger.error('Play card error:', error);
      socket.emit('game:error', { message: error.message });
    }
  });
};

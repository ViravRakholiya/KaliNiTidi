import { logger } from '../utils/logger.js';
import { gameManager } from '../services/gameManager.js';

export const handleGameEvents = (io, socket) => {
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

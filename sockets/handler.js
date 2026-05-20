import { logger } from '../utils/logger.js';
import { handleGameSocket } from './gameSocket.js';
import { reconnectionManager } from '../services/reconnectionManager.js';

export const initializeSocket = (io) => {
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.emit('CONNECTED', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    handleGameSocket(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id}, Reason: ${reason}`);

      // Store player data for potential reconnection
      if (socket.data.userId && socket.data.gameId) {
        const gameData = {
          userId: socket.data.userId,
          gameId: socket.data.gameId,
          socketId: socket.id,
          disconnectedAt: new Date().toISOString()
        };

        reconnectionManager.markDisconnected(socket.data.userId, gameData);

        // Notify other players in the game
        socket.to(`game:${socket.data.gameId}`).emit('player:disconnected', {
          userId: socket.data.userId,
          gameId: socket.data.gameId,
          canReconnect: true,
          gracePeriodMs: reconnectionManager.getRemainingGracePeriod(socket.data.userId)
        });

        logger.info(`Player ${socket.data.userId} from game ${socket.data.gameId} marked for reconnection`);
      }

      // Clean up socket data
      socket.data.userId = null;
      socket.data.gameId = null;
    });

    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('Socket handlers initialized');
};

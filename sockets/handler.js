import { logger } from '../utils/logger.js';
import { handleGameSocket } from './gameSocket.js';

export const initializeSocket = (io) => {
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.emit('CONNECTED', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    // Room/game events (also registers its own disconnect handler that
    // removes the player from their room).
    handleGameSocket(io, socket);

    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('Socket handlers initialized');
};

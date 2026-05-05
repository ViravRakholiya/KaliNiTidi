import { logger } from '../utils/logger.js';
import { handleGameSocket } from './gameSocket.js';

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
    });

    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('Socket handlers initialized');
};

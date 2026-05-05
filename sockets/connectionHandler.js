import { logger } from '../utils/logger.js';
import { handleGameEvents } from './gameHandler.js';
import { handleAuthEvents } from './authHandler.js';

export const handleConnection = (io, socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Send welcome message to client
  socket.emit('connected', {
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  // Handle authentication events
  handleAuthEvents(io, socket);

  // Handle game events
  handleGameEvents(io, socket);

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logger.info(`Client disconnected: ${socket.id}, Reason: ${reason}`);

    // Clean up user data from games
    socket.data.userId = null;
    socket.data.gameId = null;
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
  });
};

import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app/index.js';
import { initializeSocket } from './sockets/handler.js';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: config.cors.origin,
    methods: config.cors.methods,
    credentials: config.cors.credentials
  },
  pingTimeout: config.socket.pingTimeout,
  pingInterval: config.socket.pingInterval
});

// Initialize socket handlers
initializeSocket(io);

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`Socket.io server initialized`);
});

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

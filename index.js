import { createServer } from 'http';
import { Server } from 'socket.io';

// Add startup logging
console.log('🚀 Starting KaliNiTidi server...');
console.log('📝 Node version:', process.version);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

try {
  var app = await import('./app/index.js');
  app = app.default;
  console.log('✅ App loaded successfully');
} catch (error) {
  console.error('❌ Failed to load app:', error.message);
  console.error(error.stack);
  process.exit(1);
}

try {
  var { initializeSocket } = await import('./sockets/handler.js');
  console.log('✅ Socket handlers loaded');
} catch (error) {
  console.error('❌ Failed to load socket handlers:', error.message);
  console.error(error.stack);
  process.exit(1);
}

try {
  var { logger } = await import('./utils/logger.js');
  var { config } = await import('./config/index.js');
  console.log('✅ Config loaded');
} catch (error) {
  console.error('❌ Failed to load config:', error.message);
  console.error(error.stack);
  process.exit(1);
}

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
  pingInterval: config.socket.pingInterval,
  // Seamlessly restore the same socket (id, rooms and missed events) when a
  // client reconnects shortly after a temporary drop, e.g. the app being
  // backgrounded on mobile. Longer drops fall back to the REJOIN_ROOM flow.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Initialize socket handlers
initializeSocket(io);

// Start server. Bind explicitly to 0.0.0.0 so platforms like Render can reach
// the internal health check (Node's default bind can be IPv6-only '::').
const PORT = config.port;
const HOST = '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  logger.info(`Server running on ${HOST}:${PORT}`);
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

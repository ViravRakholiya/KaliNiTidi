import express from 'express';
import cors from 'cors';
import { config } from '../config/index.js';
import healthRoutes from '../controllers/healthController.js';
import { errorHandler, notFoundHandler } from '../utils/middleware.js';

const app = express();

// Middleware
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Routes
app.use('/health', healthRoutes);

// API routes (to be added)
// app.use('/api/v1/games', gameRoutes);
// app.use('/api/v1/auth', authRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

export default app;

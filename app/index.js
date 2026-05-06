import express from 'express';
import cors from 'cors';
import { config } from '../config/index.js';
import healthRoutes from '../controllers/healthController.js';
import { errorHandler, notFoundHandler } from '../utils/middleware.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Serve static files from public directory (unified game client)
app.use(express.static(join(__dirname, 'public')));

// Legacy routes - redirect to main page
app.use('/test-client', (req, res) => res.redirect('/'));
app.use('/game-test', (req, res) => res.redirect('/'));
app.use('/bidding-test', (req, res) => res.redirect('/'));

// Routes
app.use('/health', healthRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

export default app;

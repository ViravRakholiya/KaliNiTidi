import express from 'express';
import cors from 'cors';
import { config } from '../config/index.js';
import healthRoutes from '../controllers/healthController.js';
import { errorHandler, notFoundHandler } from '../utils/middleware.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

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

// The React client (app/client) builds into app/client/dist. When that build
// exists we serve it as the primary client; otherwise we fall back to the
// original vanilla client in app/public. The vanilla client also stays
// reachable at /legacy regardless, so nothing is lost.
const distDir = join(__dirname, 'client', 'dist');
const publicDir = join(__dirname, 'public');
const hasBuild = existsSync(join(distDir, 'index.html'));

if (hasBuild) {
  app.use(express.static(distDir));
}
// Shared assets (manifest, sw.js, icons, socket.io.min.js) + the legacy client.
app.use(express.static(publicDir));

// Explicit access to the original vanilla client.
app.get('/legacy', (req, res) => res.sendFile(join(publicDir, 'index.html')));

// Legacy routes - redirect to main page
app.use('/test-client', (req, res) => res.redirect('/'));
app.use('/game-test', (req, res) => res.redirect('/'));
app.use('/bidding-test', (req, res) => res.redirect('/'));

// Routes
app.use('/health', healthRoutes);

// SPA fallback: serve the React entry for any other GET so deep links work.
if (hasBuild) {
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/health')) return next();
    res.sendFile(join(distDir, 'index.html'));
  });
}

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

export default app;

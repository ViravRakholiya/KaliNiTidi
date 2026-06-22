import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple paths for .env file
const envPaths = [
  join(__dirname, '../../.env'),
  resolve(process.cwd(), '.env'),
  '.env'
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    envLoaded = true;
    console.log(`Loaded .env from: ${envPath}`);
    break;
  }
}

if (!envLoaded) {
  console.warn('Warning: .env file not found. Using default values.');
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  },

  socket: {
    // Reduced timeouts for better connection stability on Render.com
    // More frequent heartbeats prevent proxy idle timeouts
    pingTimeout: 30000,        // Time to wait for pong response (was 60000)
    pingInterval: 10000,       // Send ping every 10s (was 25000)
    // Reconnection settings
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    maxReconnectionAttempts: 10
  }
};

export { config };

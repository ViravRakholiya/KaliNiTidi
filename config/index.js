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

  supabase: {
    url: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    key: process.env.SUPABASE_KEY || 'placeholder-key',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  },

  socket: {
    pingTimeout: 60000,
    pingInterval: 25000
  }
};

// Validate required environment variables
const requiredEnvVars = [
  { name: 'SUPABASE_URL', value: config.supabase.url },
  { name: 'SUPABASE_KEY', value: config.supabase.key }
];
const missingEnvVars = requiredEnvVars.filter(({ name, value }) => {
  return !value || value.includes('placeholder');
});

if (missingEnvVars.length > 0) {
  const missingNames = missingEnvVars.map(v => v.name).join(', ');
  if (config.env === 'production') {
    throw new Error(`Missing required environment variables: ${missingNames}`);
  } else {
    console.warn(`Warning: Using placeholder values for: ${missingNames}`);
    console.warn('Set up your .env file with proper Supabase credentials.');
  }
}

export { config };

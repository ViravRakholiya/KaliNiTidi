import { createClient } from '@supabase/supabase-js';
import { config } from './index.js';

// Monkey-patch the RealtimeClient to skip WebSocket initialization
// This allows the Supabase client to work without native WebSocket support
import { RealtimeClient } from '@supabase/realtime-js';
const OriginalRealtimeClient = RealtimeClient;
RealtimeClient.prototype._initializeOptions = function() {
  // Skip WebSocket initialization
  this.accessToken = this.params?.token || '';
  this.channels = [];
};

// Create Supabase client
const supabase = createClient(
  config.supabase.url,
  config.supabase.key,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    db: {
      schema: 'public'
    }
  }
);

// Admin client with service role key (use with caution)
const supabaseAdmin = config.supabase.serviceRoleKey
  ? createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        db: {
          schema: 'public'
        }
      }
    )
  : null;

export { supabase, supabaseAdmin };

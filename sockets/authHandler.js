import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';

export const handleAuthEvents = (io, socket) => {
  socket.on('auth:login', async (data) => {
    try {
      const { token } = data;

      if (!token) {
        socket.emit('auth:error', { message: 'Authentication token required' });
        return;
      }

      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        socket.emit('auth:error', { message: 'Invalid authentication token' });
        return;
      }

      socket.data.userId = user.id;
      socket.data.userEmail = user.email;

      socket.emit('auth:success', {
        userId: user.id,
        email: user.email
      });

      logger.info(`User authenticated: ${user.id}`);
    } catch (error) {
      logger.error('Authentication error:', error);
      socket.emit('auth:error', { message: 'Authentication failed' });
    }
  });

  socket.on('auth:logout', () => {
    socket.data.userId = null;
    socket.data.userEmail = null;
    socket.emit('auth:logged_out');
    logger.info(`User logged out: ${socket.id}`);
  });
};

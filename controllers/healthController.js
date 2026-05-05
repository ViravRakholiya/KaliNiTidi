import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    // Check Supabase connection
    try {
      const { error } = await supabase.from('_').select('*').limit(1);
      health.database = error ? 'disconnected' : 'connected';
    } catch (dbError) {
      health.database = 'disconnected';
      health.databaseError = dbError.message;
    }

    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: error.message
    });
  }
});

export default router;

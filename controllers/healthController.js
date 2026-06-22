import express from 'express';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: error.message
    });
  }
});

export default router;

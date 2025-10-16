import { Router, Request, Response } from 'express';
import { testDatabaseConnection } from '../config/database';
import { testResendConnection } from '../config/resend';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

/**
 * GET /api/health
 * General health check
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    sendSuccess(res, {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    sendError(res, error.message);
  }
});

/**
 * GET /api/health/db
 * Database connection health check
 */
router.get('/db', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const connected = await testDatabaseConnection();
    const latency = Date.now() - startTime;

    if (connected) {
      sendSuccess(res, {
        connected: true,
        latency: `${latency}ms`,
      });
    } else {
      sendError(res, 'Database connection failed', 503);
    }
  } catch (error: any) {
    sendError(res, error.message, 503);
  }
});

/**
 * GET /api/health/resend
 * Resend API health check
 */
router.get('/resend', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const connected = await testResendConnection();
    const latency = Date.now() - startTime;

    if (connected) {
      sendSuccess(res, {
        connected: true,
        latency: `${latency}ms`,
      });
    } else {
      sendError(res, 'Resend API connection failed', 503);
    }
  } catch (error: any) {
    sendError(res, error.message, 503);
  }
});

export default router;

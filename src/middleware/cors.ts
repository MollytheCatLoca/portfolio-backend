import cors, { CorsOptions } from 'cors';
import env from '../config/env';
import logger from '../utils/logger';

/**
 * CORS configuration
 * Only allows requests from configured origins
 */
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (env.ALLOWED_ORIGINS.includes(origin)) {
      logger.debug(`CORS: Allowed origin: ${origin}`);
      return callback(null, true);
    }

    // Origin not allowed
    logger.warn(`CORS: Blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400, // 24 hours
};

export default cors(corsOptions);

import { Request, Response, NextFunction } from 'express';
import env from '../config/env';
import { sendUnauthorized } from '../utils/response';
import logger from '../utils/logger';

/**
 * API Key authentication middleware
 * Expects: Authorization: Bearer YOUR_API_KEY
 */
export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists
  if (!authHeader) {
    logger.warn('Authentication failed: No Authorization header', {
      ip: req.ip,
      path: req.path,
    });
    sendUnauthorized(res);
    return;
  }

  // Check format: Bearer TOKEN
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('Authentication failed: Invalid Authorization format', {
      ip: req.ip,
      path: req.path,
    });
    sendUnauthorized(res);
    return;
  }

  const token = parts[1];

  // Validate API key
  if (token !== env.API_KEY) {
    logger.warn('Authentication failed: Invalid API key', {
      ip: req.ip,
      path: req.path,
    });
    sendUnauthorized(res);
    return;
  }

  // Authentication successful
  next();
}

/**
 * Optional authentication middleware
 * Allows request to proceed even without valid authentication
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1] === env.API_KEY) {
      // Valid authentication
      (req as any).authenticated = true;
    }
  }

  next();
}

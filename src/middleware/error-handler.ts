import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';
import env from '../config/env';

/**
 * Global error handler middleware
 * Catches all errors and sends appropriate responses
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    handlePrismaError(err, res);
    return;
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({
      success: false,
      error: 'CORS policy violation',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const message = env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(
  err: Prisma.PrismaClientKnownRequestError,
  res: Response
): void {
  switch (err.code) {
    case 'P2002':
      // Unique constraint violation
      res.status(409).json({
        success: false,
        error: 'Duplicate entry',
        details: 'A record with this value already exists',
        timestamp: new Date().toISOString(),
      });
      break;

    case 'P2025':
      // Record not found
      res.status(404).json({
        success: false,
        error: 'Record not found',
        timestamp: new Date().toISOString(),
      });
      break;

    case 'P2003':
      // Foreign key constraint violation
      res.status(400).json({
        success: false,
        error: 'Invalid reference',
        details: 'Referenced record does not exist',
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      // Other Prisma errors
      res.status(500).json({
        success: false,
        error: 'Database error',
        ...(env.NODE_ENV === 'development' && { details: err.message }),
        timestamp: new Date().toISOString(),
      });
  }
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(
  req: Request,
  res: Response
): void {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
    timestamp: new Date().toISOString(),
  });
}

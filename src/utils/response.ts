import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  error: string,
  statusCode: number = 500,
  data?: any
): Response {
  const response: ApiResponse = {
    success: false,
    error,
    data,
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
}

/**
 * Send validation error response
 */
export function sendValidationError(
  res: Response,
  errors: string[]
): Response {
  return sendError(res, 'Validation failed', 400, { errors });
}

/**
 * Send not found response
 */
export function sendNotFound(
  res: Response,
  resource: string = 'Resource'
): Response {
  return sendError(res, `${resource} not found`, 404);
}

/**
 * Send unauthorized response
 */
export function sendUnauthorized(res: Response): Response {
  return sendError(res, 'Unauthorized', 401);
}

/**
 * Send forbidden response
 */
export function sendForbidden(res: Response): Response {
  return sendError(res, 'Forbidden', 403);
}

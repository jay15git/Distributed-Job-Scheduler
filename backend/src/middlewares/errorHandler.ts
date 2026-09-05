import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { sendError } from '../utils/response';
import { logger } from '../config/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.warn({ err, code: err.code }, err.message);
    return sendError(res, err.statusCode, err.message, err.code, err.details);
  }

  // Fallback for unhandled errors
  logger.error({ err }, 'Unhandled Exception');
  return sendError(res, 500, 'Internal Server Error', 'INTERNAL_SERVER_ERROR');
};

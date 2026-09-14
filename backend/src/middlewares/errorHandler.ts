import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
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

  // Map common Prisma errors to useful 4xx instead of opaque 500s
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return sendError(res, 409, 'Resource already exists (unique constraint)', 'CONFLICT');
    }
    if (err.code === 'P2003') {
      return sendError(res, 400, 'Referenced resource does not exist (foreign key)', 'BAD_REQUEST');
    }
    if (err.code === 'P2025') {
      return sendError(res, 404, 'Record not found', 'NOT_FOUND');
    }
  }

  // Fallback for unhandled errors
  logger.error({ err }, 'Unhandled Exception');
  return sendError(res, 500, 'Internal Server Error', 'INTERNAL_SERVER_ERROR');
};

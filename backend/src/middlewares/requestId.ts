import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const reqId = req.headers['x-request-id'] || uuidv4();
  req.headers['x-request-id'] = reqId;
  res.locals.requestId = reqId;
  res.setHeader('X-Request-ID', reqId);
  next();
};

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const corrId = req.headers['x-correlation-id'] || uuidv4();
  req.headers['x-correlation-id'] = corrId;
  res.locals.correlationId = corrId;
  res.setHeader('X-Correlation-ID', corrId);
  next();
};

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contextStorage, RequestContext } from '../config/context';

export const contextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || `req-${uuidv4()}`;
  const correlationId = (req.headers['x-correlation-id'] as string) || `corr-${uuidv4()}`;

  const context: RequestContext = {
    requestId,
    correlationId,
    // Note: organizationId, projectId, userId can be populated later by auth middleware
  };

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);

  contextStorage.run(context, () => {
    next();
  });
};

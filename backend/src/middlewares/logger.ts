import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

export const loggingMiddleware = pinoHttp({
  // PINO HTTP generates req/res in standard shapes
  logger,
  customProps: (_req: any, res: any) => {
    return {
      requestId: res.locals.requestId,
      correlationId: res.locals.correlationId,
      userId: res.locals.user?.id,
      organizationId: res.locals.user?.organizationId,
    };
  },
  customLogLevel: (req: any, res: any, err: any) => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
      return 'error';
    }
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `[${req.method}] ${req.url} completed in ${res.statusCode}`;
  },
});

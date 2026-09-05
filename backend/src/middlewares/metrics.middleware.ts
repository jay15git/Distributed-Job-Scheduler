import { Request, Response, NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestErrorsTotal,
  httpActiveRequests,
} from '../config/metrics';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Ignore metrics endpoint itself to avoid noise
  if (req.path === '/metrics' || req.path === '/health' || req.path === '/live' || req.path === '/ready') {
    return next();
  }

  const start = process.hrtime();
  httpActiveRequests.inc();

  res.on('finish', () => {
    httpActiveRequests.dec();

    const diff = process.hrtime(start);
    const durationSec = diff[0] + diff[1] / 1e9;

    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDurationSeconds.observe({ method, route, status_code: statusCode }, durationSec);

    if (statusCode >= 400) {
      httpRequestErrorsTotal.inc({ method, route });
    }
  });

  next();
};

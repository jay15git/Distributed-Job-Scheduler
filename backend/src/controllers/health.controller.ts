import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { metricsRegistry } from '../config/metrics';

export class HealthController {
  public static async getHealth(req: Request, res: Response) {
    return sendSuccess(res, 200, 'System is healthy', {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  public static async getMetrics(req: Request, res: Response) {
    try {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (ex: any) {
      res.status(500).send(ex.message);
    }
  }

  public static async getLive(req: Request, res: Response) {
    return sendSuccess(res, 200, 'Liveness probe passed', { status: 'ok' });
  }

  public static async getReady(req: Request, res: Response) {
    // Check DB
    let dbStatus = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    // Check Redis
    let redisStatus = 'ok';
    try {
      await redis.ping();
    } catch {
      redisStatus = 'error';
    }

    const isReady = dbStatus === 'ok' && redisStatus === 'ok';
    const status = isReady ? 200 : 503;

    return sendSuccess(res, status, isReady ? 'Readiness probe passed' : 'Readiness probe failed', {
      database: dbStatus,
      redis: redisStatus,
    });
  }

  public static async getVersion(req: Request, res: Response) {
    // Ideally loaded from package.json or process.env
    return sendSuccess(res, 200, 'Version info', {
      version: process.env.npm_package_version || '1.0.0',
      node: process.version,
    });
  }
}

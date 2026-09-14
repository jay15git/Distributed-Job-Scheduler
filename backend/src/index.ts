import { app } from './app/app';
import { env } from './config/env';
import { logger } from './config/logger';
import { startWorker } from './worker';
import { startScheduler } from './scheduler';
import { prisma } from './config/prisma';
import { redis } from './config/redis';
import express from 'express';

const role = process.env.ROLE || 'api';

const startHealthServer = (port: number, roleName: string) => {
  const healthApp = express();
  
  healthApp.get('/metrics', async (req, res) => {
    try {
      const { register } = await import('prom-client');
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(String(err));
    }
  });

  healthApp.get('/health/live', (req, res) => {
    res.json({ status: 'ok', service: roleName, message: 'Liveness probe passed' });
  });

  healthApp.get('/health/ready', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      res.json({ status: 'ok', service: roleName, message: 'Readiness probe passed' });
    } catch (err) {
      res.status(503).json({ status: 'error', service: roleName, message: 'Readiness probe failed', error: String(err) });
    }
  });

  healthApp.get('/version', (req, res) => {
    res.json({
      service: roleName,
      version: process.env.npm_package_version || '1.0.0',
      gitCommit: process.env.GIT_COMMIT || 'unknown',
      buildTime: process.env.BUILD_TIME || 'unknown',
      nodeVersion: process.version
    });
  });

  healthApp.listen(port, () => {
    logger.info(`🏥 ${roleName} Health Server running on port ${port}`);
  });
};

const startServer = () => {
  if (role === 'api') {
    const port = env.PORT || 3000;
    const server = app.listen(port, () => {
      logger.info(`🚀 API Server running on port ${port} in ${env.NODE_ENV} mode`);
      logger.info(`📚 Swagger UI available at http://localhost:${port}/api-docs`);
    });

    const shutdown = () => {
      logger.info('Graceful shutdown initiated');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } else if (role === 'worker') {
    logger.info('Starting Worker Process...');
    // Defaults sit off 3002 so `npm run dev` doesn't collide with the
    // Next.js dev server; compose pins explicit ports via HEALTH_PORT.
    startHealthServer(env.HEALTH_PORT ?? 3102, 'worker');
    startWorker().catch(e => {
      logger.error('Worker failed to start', e);
      process.exit(1);
    });
  } else if (role === 'scheduler') {
    logger.info('Starting Scheduler Process...');
    startHealthServer(env.HEALTH_PORT ?? 3101, 'scheduler');
    startScheduler().catch(e => {
      logger.error('Scheduler failed to start', e);
      process.exit(1);
    });
  } else {
    logger.error(`Unknown ROLE: ${role}`);
    process.exit(1);
  }
};

startServer();

import pino from 'pino';
import { env } from './env';
import { getContext } from './context';
import { hostname } from 'os';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  mixin() {
    const ctx = getContext();
    if (!ctx) return {};
    return {
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      queueId: ctx.queueId,
      jobId: ctx.jobId,
      executionId: ctx.executionId,
      workerId: ctx.workerId,
      schedulerId: ctx.schedulerId,
      userId: ctx.userId,
    };
  },
  base: {
    service: process.env.ROLE || 'api',
    version: process.env.npm_package_version || '1.0.0',
    hostname: hostname(),
  },
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
      'jwt',
      '*.jwt',
      'apiKey',
      '*.apiKey'
    ],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

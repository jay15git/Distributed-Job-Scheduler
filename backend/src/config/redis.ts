import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for job queues (BullMQ/Workers)
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis Connection Error');
});

redis.on('ready', () => {
  logger.info('✅ Connected to Redis');
});

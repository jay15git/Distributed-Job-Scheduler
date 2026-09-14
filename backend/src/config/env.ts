import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // 'dev' returns email tokens in API responses (no SMTP configured) —
  // opt-in only, since it leaks working reset/verification tokens to any
  // caller. 'none' is the safe default; docker-compose sets 'dev' explicitly.
  EMAIL_MODE: z.enum(['dev', 'none']).default('none'),
  // Per-role health/metrics server port for worker/scheduler processes.
  HEALTH_PORT: z.coerce.number().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;

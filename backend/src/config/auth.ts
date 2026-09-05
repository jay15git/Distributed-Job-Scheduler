import { env } from './env';

export const authConfig = {
  jwt: {
    secret: env.NODE_ENV === 'test' ? 'test-secret' : process.env.JWT_SECRET || 'super-secret-key',
    accessExpiresIn: '15m',
    refreshExpiresIn: '30d',
    issuer: 'distributed-job-scheduler',
  },
  password: {
    saltRounds: 10,
    resetTokenExpiresIn: 1000 * 60 * 60, // 1 hour
  },
  emailVerification: {
    expiresIn: 1000 * 60 * 60 * 24, // 24 hours
  },
  lockout: {
    maxAttempts: 5,
    durationMs: 1000 * 60 * 15, // 15 minutes
  },
};

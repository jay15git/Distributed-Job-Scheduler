import { beforeAll, afterAll } from 'vitest';
import { prisma as db } from '../src/database/db';

beforeAll(async () => {
  // Global test setup
  // Maybe apply some test seed data or wait for DB connection
  await db.$connect();
});

afterAll(async () => {
  await db.$disconnect();
});

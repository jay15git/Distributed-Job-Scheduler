import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app/app';
import { prisma as db } from '../../src/database/db';

describe('Auth Integration', () => {
  beforeAll(async () => {
    // Clean up specific test data if needed
    await db.user.deleteMany({ where: { email: 'test@example.com' } });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: 'test@example.com' } });
  });

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'StrongPassword1!',
        name: 'Test User'
      });

    if (res.status !== 201) console.error('Register failed:', res.body);
    expect(res.status).toBe(201);
    expect(res.body.data.message).toContain('Registration successful');
  });

  it('should login an existing user', async () => {
    // Manually mark the user as verified so we can test login
    await db.user.update({
      where: { email: 'test@example.com' },
      data: { isVerified: true }
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'StrongPassword1!'
      });

    if (res.status !== 200) console.error('Login failed:', res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app/app';
import { prisma as db } from '../../src/database/db';
import { tokenUtils } from '../../src/utils/tokens';

describe('Queue Integration', () => {
  let adminToken: string;
  let testProjectId: string;
  let queueId: string;

  beforeAll(async () => {
    // 0. Clean up previous broken state
    await db.user.deleteMany({ where: { email: 'queueadmin@example.com' } });
    await db.organization.deleteMany({ where: { slug: 'test-org-queue' } });

    // 1. Create an admin user for testing
    const user = await db.user.create({
      data: {
        email: 'queueadmin@example.com',
        passwordHash: 'dummy',
        name: 'Queue Admin',
        isVerified: true
      }
    });

    // 2. Create UserSession and generate a valid access token manually to bypass login
    const rawSessionId = tokenUtils.generateRandomToken();
    const session = await db.userSession.create({
      data: {
        userId: user.id,
        tokenHash: tokenUtils.hashToken(rawSessionId),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      }
    });

    adminToken = tokenUtils.generateAccessToken({
      userId: user.id,
      sessionId: rawSessionId,
      tokenVersion: user.tokenVersion
    });

    // 3. Create Org and Project
    const org = await db.organization.create({
      data: {
        name: 'Test Org',
        slug: 'test-org-queue',
        members: {
          create: {
            userId: user.id,
            role: 'ORG_ADMIN'
          }
        }
      }
    });

    const project = await db.project.create({
      data: {
        organizationId: org.id,
        name: 'Test Project',
        createdBy: user.id
      }
    });

    testProjectId = project.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testProjectId) {
      await db.queue.deleteMany({ where: { projectId: testProjectId } });
      await db.project.deleteMany({ where: { id: testProjectId } });
    }
    await db.organization.deleteMany({ where: { slug: 'test-org-queue' } });
    await db.user.deleteMany({ where: { email: 'queueadmin@example.com' } });
  });

  it('should create a new queue', async () => {
    const res = await request(app)
      .post('/api/v1/queues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId: testProjectId,
        name: 'integration-test-queue',
        configuration: {
          concurrencyLimit: 5,
          workerLimit: 2
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('integration-test-queue');
    expect(res.body.projectId).toBe(testProjectId);
    expect(res.body.configuration.concurrencyLimit).toBe(5);
    
    queueId = res.body.id;
  });

  it('should fetch the created queue', async () => {
    const res = await request(app)
      .get(`/api/v1/queues/${queueId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(queueId);
    expect(res.body.name).toBe('integration-test-queue');
  });

  it('should list queues in a project', async () => {
    const res = await request(app)
      .get(`/api/v1/queues?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].projectId).toBe(testProjectId);
  });

  it('should pause a queue', async () => {
    const res = await request(app)
      .patch(`/api/v1/queues/${queueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PAUSED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAUSED');
  });

  it('should drain a queue', async () => {
    const res = await request(app)
      .patch(`/api/v1/queues/${queueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DRAINING' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DRAINING');
  });

  it('should disable a queue', async () => {
    const res = await request(app)
      .patch(`/api/v1/queues/${queueId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DISABLED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DISABLED');
  });
});

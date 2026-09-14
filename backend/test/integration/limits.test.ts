import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app/app';
import { prisma as db } from '../../src/database/db';
import { redis } from '../../src/config/redis';
import { WorkerService } from '../../src/services/worker.service';
import { JobStateMachineEngine } from '../../src/services/job-state-machine.engine';
import { ExecutorRegistry } from '../../src/services/executor.registry';
import { JobRepository } from '../../src/repositories/job.repository';
import { DependencyEngine } from '../../src/services/dependency.engine';
import { JobType, JobStatus } from '@prisma/client';

/**
 * Enforcement coverage for the QueueConfiguration knobs:
 *  - maxQueueDepth, rateLimit, maxPayloadSize (API-level 429/413)
 *  - concurrencyLimit (worker claims at most N per queue)
 *  - maxExecutionTime (hung executor -> FAILED with EXEC_TIMEOUT)
 *  - DAG missed-release sweep (BLOCKED + all parents COMPLETED -> QUEUED)
 */
describe('Queue limits + execution timeout', () => {
  const suffix = Date.now().toString(36);
  const email = `limits-${suffix}@example.com`;
  let token = '';
  let orgId = '';
  let projectId = '';

  const authed = () => request(app).post('/api/v1/queues').set('Authorization', `Bearer ${token}`);

  const makeQueue = async (name: string, configuration: any) => {
    const res = await authed().send({ projectId, name, configuration });
    if (res.status !== 201) console.error('makeQueue failed:', name, JSON.stringify(res.body));
    expect(res.status).toBe(201);
    return (res.body.id ?? res.body.data?.id) as string;
  };

  const enqueue = (queueId: string, payload: any = {}) =>
    request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'IMMEDIATE', payload });

  beforeAll(async () => {
    await request(app).post('/api/v1/auth/register').send({
      email, password: 'StrongPassword1!', name: 'Limits Test',
    });
    await db.user.update({ where: { email }, data: { isVerified: true } });
    const login = await request(app).post('/api/v1/auth/login').send({
      email, password: 'StrongPassword1!',
    });
    token = login.body.data.accessToken;

    const org = await request(app).post('/api/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Limits Org', slug: `limits-org-${suffix}` });
    orgId = org.body.id ?? org.body.data?.id;

    const project = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: orgId, name: 'Limits Proj' });
    projectId = project.body.id ?? project.body.data?.id;
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.user.deleteMany({ where: { email } });
  });

  it('rejects enqueue beyond maxQueueDepth', async () => {
    const q = await makeQueue(`depth-${suffix}`, { maxQueueDepth: 2 });
    // Park two jobs as SCHEDULED so they count toward depth but never drain
    await db.job.createMany({
      data: [1, 2].map(i => ({
        queueId: q, name: `parked-${i}`, type: JobType.IMMEDIATE,
        status: JobStatus.SCHEDULED, payload: {}, maxRetries: 3,
        nextRunAt: new Date(Date.now() + 3600_000),
      })),
    });
    const res = await enqueue(q);
    expect(res.status).toBe(429);
    expect(JSON.stringify(res.body)).toContain('maxQueueDepth');
    await db.queue.delete({ where: { id: q } });
  });

  it('rejects enqueue beyond rate limit window', async () => {
    const q = await makeQueue(`rate-${suffix}`, { rateLimit: 2, rateLimitWindow: 60_000 });
    expect((await enqueue(q)).status).toBe(201);
    expect((await enqueue(q)).status).toBe(201);
    const res = await enqueue(q);
    expect(res.status).toBe(429);
    expect(JSON.stringify(res.body)).toContain('rate limit');
    await db.queue.delete({ where: { id: q } });
  });

  it('rejects payloads over maxPayloadSize', async () => {
    const q = await makeQueue(`payload-${suffix}`, { maxPayloadSize: 2048 });
    const res = await enqueue(q, { blob: 'x'.repeat(4096) });
    expect(res.status).toBe(413);
    await db.queue.delete({ where: { id: q } });
  });

  it('honors per-queue concurrencyLimit during claims', async () => {
    const q = await makeQueue(`conc-${suffix}`, { concurrencyLimit: 1 });
    try {
      await redis.xgroup('CREATE', `queue:${q}`, 'djs_workers', '0', 'MKSTREAM');
    } catch (e: any) {
      if (!e.message.includes('BUSYGROUP')) throw e;
    }

    const registry = new ExecutorRegistry();
    registry.register({
      type: JobType.IMMEDIATE,
      execute: async () => { await new Promise(r => setTimeout(r, 800)); return {}; },
    });
    const worker = new WorkerService(
      db, new JobStateMachineEngine(new JobRepository(db)), registry, 'limits-worker'
    );
    await worker.registerWorker({
      hostname: 'test-host', pid: 1, capabilities: {}, maxConcurrency: 10,
      supportedQueues: [], supportedJobTypes: [JobType.IMMEDIATE],
    });

    const jobs = await Promise.all([1, 2].map(i => db.job.create({
      data: { queueId: q, name: `c${i}`, type: JobType.IMMEDIATE,
              status: JobStatus.QUEUED, payload: {}, maxRetries: 3 },
    })));
    for (const j of jobs) await redis.xadd(`queue:${q}`, '*', 'jobId', j.id);

    const first = await worker.pollOnce([q]);
    expect(first.length).toBe(1);
    // Second poll while job 1 is mid-flight: the 1-per-queue cap must hold
    const second = await worker.pollOnce([q]);
    expect(second.length).toBe(0);

    // After job 1 finishes, the freed slot must trigger a re-claim on the
    // next poll — no new stream entry needed (no sweeper stall).
    await new Promise(r => setTimeout(r, 1200));
    const third = await worker.pollOnce([q]);
    expect(third.length).toBe(1);
    expect(jobs.map(j => j.id)).toContain(third[0].id);
    expect(third[0].id).not.toBe(first[0].id);
    await new Promise(r => setTimeout(r, 1200));
    await db.job.deleteMany({ where: { queueId: q } });
    await db.queue.delete({ where: { id: q } });
    await redis.del(`queue:${q}`);
  });

  it('fails hung executors with EXEC_TIMEOUT instead of running forever', async () => {
    const q = await makeQueue(`timeout-${suffix}`, { maxExecutionTime: 1000, heartbeatInterval: 1000, heartbeatTimeout: 60_000 });
    try {
      await redis.xgroup('CREATE', `queue:${q}`, 'djs_workers', '0', 'MKSTREAM');
    } catch (e: any) {
      if (!e.message.includes('BUSYGROUP')) throw e;
    }

    const registry = new ExecutorRegistry();
    registry.register({
      type: JobType.IMMEDIATE,
      execute: async () => { await new Promise(r => setTimeout(r, 10_000)); return {}; },
    });
    const worker = new WorkerService(
      db, new JobStateMachineEngine(new JobRepository(db)), registry, 'timeout-worker'
    );
    await worker.registerWorker({
      hostname: 'test-host', pid: 2, capabilities: {}, maxConcurrency: 10,
      supportedQueues: [], supportedJobTypes: [JobType.IMMEDIATE],
    });

    const job = await db.job.create({
      data: { queueId: q, name: 'hang', type: JobType.IMMEDIATE,
              status: JobStatus.QUEUED, payload: {}, maxRetries: 3 },
    });
    await redis.xadd(`queue:${q}`, '*', 'jobId', job.id);

    const claimed = await worker.pollOnce([q]);
    expect(claimed.length).toBe(1);

    let final: any = null;
    for (let i = 0; i < 60; i++) {
      final = await db.job.findUnique({
        where: { id: job.id },
        include: { executions: { orderBy: { startedAt: 'desc' }, take: 1 } },
      });
      if (final && [JobStatus.FAILED, JobStatus.RETRY_WAITING, JobStatus.DLQ].includes(final.status)) break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect([JobStatus.FAILED, JobStatus.RETRY_WAITING, JobStatus.DLQ]).toContain(final.status);
    expect((final.executions[0]?.error as any)?.code).toBe('EXEC_TIMEOUT');

    await db.job.deleteMany({ where: { queueId: q } });
    await db.queue.delete({ where: { id: q } });
    await redis.del(`queue:${q}`);
  }, 30_000);

  it('sweeps BLOCKED children whose parents finished before the edge committed', async () => {
    const q = await makeQueue(`dag-${suffix}`, {});
    const parent = await db.job.create({
      data: { queueId: q, name: 'parent', type: JobType.IMMEDIATE,
              status: JobStatus.COMPLETED, payload: {}, maxRetries: 3 },
    });
    const child = await db.job.create({
      data: { queueId: q, name: 'child', type: JobType.IMMEDIATE,
              status: JobStatus.BLOCKED, payload: {}, maxRetries: 3 },
    });
    // Simulate the race: edge committed after the parent's release pass ran
    await db.jobDependency.create({ data: { parentJobId: parent.id, childJobId: child.id } });

    const engine = new DependencyEngine(db, new JobStateMachineEngine(new JobRepository(db)));
    const released = await engine.releaseReady();
    expect(released).toBeGreaterThanOrEqual(1);

    const after = await db.job.findUnique({ where: { id: child.id } });
    expect(after?.status).toBe(JobStatus.QUEUED);

    await db.job.deleteMany({ where: { queueId: q } });
    await db.queue.delete({ where: { id: q } });
    await redis.del(`queue:${q}`);
  });
});

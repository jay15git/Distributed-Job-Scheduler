import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma as db } from '../../src/database/db';
import { DependencyEngine } from '../../src/services/dependency.engine';
import { WorkerService } from '../../src/services/worker.service';
import { JobStateMachineEngine } from '../../src/services/job-state-machine.engine';
import { ExecutorRegistry } from '../../src/services/executor.registry';
import { JobRepository } from '../../src/repositories/job.repository';
import { JobType, JobStatus } from '@prisma/client';
import { redis } from '../../src/config/redis';

describe('DAG Dependencies & Priority Claiming Integration', () => {
  let dependencyEngine: DependencyEngine;
  let workerService: WorkerService;
  let testQueueId: string;
  let testProjectId: string;
  let testOrgId: string;

  beforeAll(async () => {
    const jobRepo = new JobRepository(db);
    const stateMachine = new JobStateMachineEngine(jobRepo);
    dependencyEngine = new DependencyEngine(db, stateMachine);

    const registry = new ExecutorRegistry();
    registry.register({
      type: JobType.IMMEDIATE,
      execute: async (payload) => ({ success: true, payload }),
    });
    workerService = new WorkerService(db, stateMachine, registry, 'dag-test-worker');
    workerService.reclaimIdleMs = 0;
    await workerService.registerWorker({
      hostname: 'test-host',
      pid: 456,
      capabilities: {},
      maxConcurrency: 10,
      supportedQueues: [],
      supportedJobTypes: [JobType.IMMEDIATE],
    });

    const org = await db.organization.create({
      data: { name: 'DAG Test Org', slug: 'dag-test-org' },
    });
    testOrgId = org.id;

    const project = await db.project.create({
      data: { organizationId: org.id, name: 'DAG Test Project', createdBy: 'test' },
    });
    testProjectId = project.id;

    const queue = await db.queue.create({
      data: { projectId: project.id, name: 'dag-test-queue', configuration: { create: {} } },
    });
    testQueueId = queue.id;

    try {
      await redis.xgroup('CREATE', `queue:${queue.id}`, 'djs_workers', '0', 'MKSTREAM');
    } catch (e: any) {
      if (!e.message.includes('BUSYGROUP')) throw e;
    }
  });

  afterAll(async () => {
    await redis.del(`queue:${testQueueId}`);
    await db.job.deleteMany({ where: { queueId: testQueueId } });
    await db.queue.deleteMany({ where: { projectId: testProjectId } });
    await db.project.delete({ where: { id: testProjectId } });
    await db.organization.delete({ where: { id: testOrgId } });
  });

  it('releases a BLOCKED child only after every parent completes', async () => {
    const parentA = await db.job.create({
      data: { queueId: testQueueId, name: 'parent-a', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.RUNNING, maxRetries: 3 },
    });
    const parentB = await db.job.create({
      data: { queueId: testQueueId, name: 'parent-b', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.RUNNING, maxRetries: 3 },
    });
    const child = await db.job.create({
      data: { queueId: testQueueId, name: 'child', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.BLOCKED, maxRetries: 3 },
    });
    await db.jobDependency.createMany({
      data: [
        { parentJobId: parentA.id, childJobId: child.id },
        { parentJobId: parentB.id, childJobId: child.id },
      ],
    });

    // One parent done, one still running -> child stays BLOCKED
    await db.job.update({ where: { id: parentA.id }, data: { status: JobStatus.COMPLETED } });
    await dependencyEngine.releaseDependents(parentA.id);
    expect((await db.job.findUnique({ where: { id: child.id } }))?.status).toBe(JobStatus.BLOCKED);

    // Both parents done -> child released to QUEUED with a stream notification
    await db.job.update({ where: { id: parentB.id }, data: { status: JobStatus.COMPLETED } });
    await dependencyEngine.releaseDependents(parentB.id);
    expect((await db.job.findUnique({ where: { id: child.id } }))?.status).toBe(JobStatus.QUEUED);

    const messages = await redis.xrange(`queue:${testQueueId}`, '-', '+');
    expect(messages.some(m => m[1][1] === child.id)).toBe(true);
  });

  it('cancels BLOCKED children when a parent dies permanently', async () => {
    const deadParent = await db.job.create({
      data: { queueId: testQueueId, name: 'dead-parent', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.DLQ, maxRetries: 3 },
    });
    const orphan = await db.job.create({
      data: { queueId: testQueueId, name: 'orphan', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.BLOCKED, maxRetries: 3 },
    });
    await db.jobDependency.create({
      data: { parentJobId: deadParent.id, childJobId: orphan.id },
    });

    const cancelled = await dependencyEngine.cancelOrphans();
    expect(cancelled).toBeGreaterThanOrEqual(1);
    expect((await db.job.findUnique({ where: { id: orphan.id } }))?.status).toBe(JobStatus.CANCELLED);
  });

  it('claims the highest-priority QUEUED job first', async () => {
    const low = await db.job.create({
      data: { queueId: testQueueId, name: 'low-prio', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.QUEUED, priority: 1, maxRetries: 3 },
    });
    const high = await db.job.create({
      data: { queueId: testQueueId, name: 'high-prio', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.QUEUED, priority: 9, maxRetries: 3 },
    });

    // Wake-up for the low-priority job arrives first; the DB claim must still
    // pick the high-priority row.
    await redis.xadd(`queue:${testQueueId}`, '*', 'jobId', low.id);

    const claimed = await workerService.pollOnce([testQueueId], 100);
    expect(claimed.length).toBe(1);
    expect(claimed[0].id).toBe(high.id);

    await new Promise(r => setTimeout(r, 200));
    const highJob = await db.job.findUnique({ where: { id: high.id } });
    expect([JobStatus.COMPLETED, JobStatus.RUNNING]).toContain(highJob?.status);
  });

  it('reclaims pending stream entries abandoned by a dead consumer', async () => {
    const job = await db.job.create({
      data: { queueId: testQueueId, name: 'abandoned', payload: {}, type: JobType.IMMEDIATE, status: JobStatus.QUEUED, priority: 99, maxRetries: 3 },
    });
    await redis.xadd(`queue:${testQueueId}`, '*', 'jobId', job.id);

    // A dead consumer reads the entry but never acks -> it sits pending.
    const pending = await redis.xreadgroup(
      'GROUP', 'djs_workers', 'dead-consumer',
      'COUNT', 1, 'STREAMS', `queue:${testQueueId}`, '>'
    );
    expect(pending).not.toBeNull();

    // Worker poll reclaims the stale pending entry and claims the job.
    const claimed = await workerService.pollOnce([testQueueId], 100);
    expect(claimed.some(c => c.id === job.id)).toBe(true);

    await new Promise(r => setTimeout(r, 200));
    const dbJob = await db.job.findUnique({ where: { id: job.id } });
    expect([JobStatus.COMPLETED, JobStatus.RUNNING]).toContain(dbJob?.status);
  });
});

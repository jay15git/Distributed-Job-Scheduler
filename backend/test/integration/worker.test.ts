import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma as db } from '../../src/database/db';
import { WorkerService } from '../../src/services/worker.service';
import { JobStateMachineEngine } from '../../src/services/job-state-machine.engine';
import { ExecutorRegistry } from '../../src/services/executor.registry';
import { JobRepository } from '../../src/repositories/job.repository';
import { JobType, JobStatus } from '@prisma/client';
import { redis } from '../../src/config/redis';

describe('Worker Execution Integration', () => {
  let workerService: WorkerService;
  const suffix = Date.now().toString(36);
  let testQueueId = '';
  let testProjectId = '';
  const workerId = 'test-worker-1';

  beforeAll(async () => {
    const jobRepo = new JobRepository(db);
    const stateMachine = new JobStateMachineEngine(jobRepo);
    const registry = new ExecutorRegistry();
    registry.register({
      type: JobType.IMMEDIATE,
      execute: async (payload) => {
        if (payload.shouldFail) {
          throw new Error('Simulated failure');
        }
        return { success: true, payload };
      }
    });
    workerService = new WorkerService(db, stateMachine, registry, workerId);
    
    // Register worker
    await workerService.registerWorker({
      hostname: 'test-host',
      pid: 123,
      capabilities: {},
      maxConcurrency: 10,
      supportedQueues: ['test-queue'],
      supportedJobTypes: [JobType.IMMEDIATE]
    });
    
    // Create Org, Project, Queue
    const org = await db.organization.create({
      data: {
        name: 'Worker Test Org',
        slug: `worker-test-org-${suffix}`,
      }
    });

    const project = await db.project.create({
      data: {
        organizationId: org.id,
        name: 'Worker Test Project',
        createdBy: 'system'
      }
    });
    testProjectId = project.id;

    const queue = await db.queue.create({
      data: {
        projectId: project.id,
        name: 'test-queue',
        configuration: {
          create: {
            claimTimeout: 5000,
            visibilityTimeout: 30000
          }
        }
      }
    });
    testQueueId = queue.id;
    
    // Make sure redis group exists
    try {
      await redis.xgroup('CREATE', `queue:${queue.id}`, 'djs_workers', '0', 'MKSTREAM');
    } catch(e: any) {
      if (!e.message.includes('BUSYGROUP')) throw e;
    }
  });

  afterAll(async () => {
    if (testQueueId) {
      await db.job.deleteMany({ where: { queueId: testQueueId } });
      await db.queue.deleteMany({ where: { id: testQueueId } });
      await redis.del(`queue:${testQueueId}`);
    }
    if (testProjectId) await db.project.delete({ where: { id: testProjectId } });
    await db.organization.deleteMany({ where: { slug: `worker-test-org-${suffix}` } });
  });

  it('should claim, execute and complete a job successfully', async () => {
    // 1. Enqueue job
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Test Job',
        payload: { task: 'echo', data: 'hello' },
        status: JobStatus.QUEUED,
        type: JobType.IMMEDIATE,
        maxRetries: 3
      }
    });
    
    // Add to redis stream
    await redis.xadd(`queue:${testQueueId}`, '*', 'jobId', job.id);

    // 2. Poll
    const claimedJobs = await workerService.pollOnce([testQueueId]);
    
    expect(claimedJobs.length).toBe(1);
    expect(claimedJobs[0].id).toBe(job.id);

    // CLAIMED is transient: executeJob starts without awaiting pollOnce, so by
    // the time we read, the job may already be RUNNING or COMPLETED.
    const dbJob = await db.job.findUnique({ where: { id: job.id } });
    expect([JobStatus.CLAIMED, JobStatus.RUNNING, JobStatus.COMPLETED]).toContain(dbJob?.status);
    expect(dbJob?.lockedBy).toBe(workerId);

    // 3. Wait for execution
    let completedJob = null;
    for (let i = 0; i < 40; i++) {
      completedJob = await db.job.findUnique({ where: { id: job.id } });
      if (completedJob?.status === JobStatus.COMPLETED) break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect(completedJob?.status).toBe(JobStatus.COMPLETED);
  });

  it('should fail a job when execution throws an error', async () => {
    // 1. Enqueue job
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Test Failing Job',
        payload: { shouldFail: true },
        status: JobStatus.QUEUED,
        type: JobType.IMMEDIATE,
        maxRetries: 3
      }
    });
    
    // Add to redis stream
    await redis.xadd(`queue:${testQueueId}`, '*', 'jobId', job.id);

    // 2. Poll
    const claimedJobs = await workerService.pollOnce([testQueueId]);

    expect(claimedJobs.length).toBe(1);

    // 3. Wait for the failure to land. FAILED is transient once the retry
    // pipeline is wired — a concurrent recovery sweep moves it to
    // RETRY_WAITING or (no policy on this queue) DLQ between our reads.
    let failedJob = null;
    for (let i = 0; i < 40; i++) {
      failedJob = await db.job.findUnique({ where: { id: job.id } });
      if (failedJob && [JobStatus.FAILED, JobStatus.RETRY_WAITING, JobStatus.DLQ].includes(failedJob.status)) break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect([JobStatus.FAILED, JobStatus.RETRY_WAITING, JobStatus.DLQ]).toContain(failedJob?.status);
  });
  
  it('should not allow two workers to claim the same job', async () => {
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Concurrent Test Job',
        payload: { task: 'concurrency' },
        status: JobStatus.QUEUED,
        type: JobType.IMMEDIATE,
        maxRetries: 3
      }
    });
    
    await redis.xadd(`queue:${testQueueId}`, '*', 'jobId', job.id);
    
    // Create a second worker
    const jobRepo2 = new JobRepository(db);
    const stateMachine2 = new JobStateMachineEngine(jobRepo2);
    const registry2 = new ExecutorRegistry();
    registry2.register({
      type: JobType.IMMEDIATE,
      execute: async (payload) => { return { success: true }; }
    });
    const worker2 = new WorkerService(db, stateMachine2, registry2, 'test-worker-2');
    
    // Both try to poll at the same time
    const [claimedBy1, claimedBy2] = await Promise.all([
      workerService.pollOnce([testQueueId]),
      worker2.pollOnce([testQueueId])
    ]);
    
    // Only one should have gotten the job
    const totalClaimed = claimedBy1.length + claimedBy2.length;
    expect(totalClaimed).toBe(1);
    
    // Wait for execution to finish
    await new Promise(r => setTimeout(r, 100));
  });
});

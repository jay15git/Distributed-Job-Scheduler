import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma as db } from '../../src/database/db';
import { SchedulerEngine } from '../../src/services/scheduler.engine';
import { RecoveryEngine } from '../../src/services/recovery.engine';
import { RetryEngine } from '../../src/services/retry.engine';
import { RetryPolicyService } from '../../src/services/retry-policy.service';
import { RetryPolicyRepository } from '../../src/repositories/retry-policy.repository';
import { JobRepository } from '../../src/repositories/job.repository';
import { JobStateMachineEngine } from '../../src/services/job-state-machine.engine';
import { QueueMetricsService } from '../../src/services/queue-metrics.service';
import { QueueMetricsRepository } from '../../src/repositories/queue-metrics.repository';
import { JobStatus, JobType, RetryStrategy } from '@prisma/client';
import { redis } from '../../src/config/redis';

describe('Recovery & Scheduling Pipeline Integration', () => {
  let scheduler: SchedulerEngine;
  let recovery: RecoveryEngine;
  let retryEngine: RetryEngine;
  let testQueueId: string;
  let testProjectId: string;
  let testOrgId: string;

  beforeAll(async () => {
    const jobRepo = new JobRepository(db);
    const stateMachine = new JobStateMachineEngine(jobRepo);
    retryEngine = new RetryEngine(
      db,
      stateMachine,
      new RetryPolicyService(new RetryPolicyRepository(db))
    );
    scheduler = new SchedulerEngine(db, stateMachine);
    recovery = new RecoveryEngine(
      db,
      stateMachine,
      new QueueMetricsService(new QueueMetricsRepository(db)),
      retryEngine
    );

    const org = await db.organization.create({
      data: { name: 'Recovery Test Org', slug: 'recovery-test-org' },
    });
    testOrgId = org.id;

    const project = await db.project.create({
      data: { organizationId: org.id, name: 'Recovery Test Project', createdBy: 'test' },
    });
    testProjectId = project.id;

    const policy = await db.retryPolicy.create({
      data: {
        name: 'Recovery Policy',
        organizationId: org.id,
        maxAttempts: 2,
        strategy: RetryStrategy.FIXED_DELAY,
        initialDelayMs: 50,
        jitterEnabled: false,
      },
    });

    const queue = await db.queue.create({
      data: {
        projectId: project.id,
        name: 'recovery-test-queue',
        retryPolicyId: policy.id,
        configuration: { create: {} },
      },
    });
    testQueueId = queue.id;

    await db.projectSetting.create({
      data: { projectId: project.id, defaultQueueId: queue.id },
    });
  });

  afterAll(async () => {
    await redis.del(`queue:${testQueueId}`);
    await db.deadLetterQueue.deleteMany({ where: { queueId: testQueueId } });
    await db.job.deleteMany({ where: { queueId: testQueueId } });
    await db.scheduledJob.deleteMany({ where: { projectId: testProjectId } });
    await db.projectSetting.deleteMany({ where: { projectId: testProjectId } });
    await db.queue.deleteMany({ where: { projectId: testProjectId } });
    await db.retryPolicy.deleteMany({ where: { organizationId: testOrgId } });
    await db.project.delete({ where: { id: testProjectId } });
    await db.organization.delete({ where: { id: testOrgId } });
  });

  it('should promote due RETRY_WAITING jobs back to QUEUED', async () => {
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Retry Waiting Job',
        payload: {},
        type: JobType.IMMEDIATE,
        status: JobStatus.RETRY_WAITING,
        maxRetries: 3,
        retryCount: 1,
        nextRunAt: new Date(Date.now() - 1000),
      },
    });

    const processed = await scheduler.processScheduledJobs();
    expect(processed).toBeGreaterThanOrEqual(1);

    const dbJob = await db.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).toBe(JobStatus.QUEUED);
  });

  it('should reclaim CLAIMED jobs past claimTimeout and republish', async () => {
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Stuck Claim',
        payload: {},
        type: JobType.IMMEDIATE,
        status: JobStatus.CLAIMED,
        maxRetries: 3,
        lockedBy: 'dead-worker',
        lockedAt: new Date(Date.now() - 60_000),
      },
    });

    await recovery.executeFastSweep();

    const dbJob = await db.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).toBe(JobStatus.QUEUED);
    expect(dbJob?.lockedBy).toBeNull();

    const messages = await redis.xrange(`queue:${testQueueId}`, '-', '+');
    expect(messages.some(m => m[1][1] === job.id)).toBe(true);
  });

  it('should evaluate unevaluated FAILED jobs into RETRY_WAITING', async () => {
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Unevaluated Failure',
        payload: {},
        type: JobType.IMMEDIATE,
        status: JobStatus.FAILED,
        maxRetries: 3,
        retryCount: 0,
      },
    });

    await recovery.executeFastSweep();

    const dbJob = await db.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).toBe(JobStatus.RETRY_WAITING);
    expect(dbJob?.retryCount).toBe(1);
    expect(dbJob?.nextRunAt).not.toBeNull();
  });

  it('should materialize a cron schedule into a QUEUED job and roll nextRunAt', async () => {
    const schedule = await db.scheduledJob.create({
      data: {
        projectId: testProjectId,
        name: 'test-cron',
        cronExpression: '*/5 * * * *',
        payload: { taskType: 'IMMEDIATE' },
        nextRunAt: new Date(Date.now() - 1000),
      },
    });

    const created = await scheduler.processCronSchedules();
    expect(created).toBe(1);

    const job = await db.job.findFirst({ where: { name: 'test-cron' } });
    expect(job?.status).toBe(JobStatus.QUEUED);
    expect(job?.type).toBe(JobType.CRON);
    expect(job?.queueId).toBe(testQueueId);

    const updated = await db.scheduledJob.findUnique({ where: { id: schedule.id } });
    expect(updated?.nextRunAt?.getTime()).toBeGreaterThan(Date.now());
    expect(updated?.lastRunAt).not.toBeNull();
  });
});

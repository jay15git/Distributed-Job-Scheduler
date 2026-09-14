import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma as db } from '../../src/database/db';
import { redis } from '../../src/config/redis';
import { RetryEngine } from '../../src/services/retry.engine';
import { JobStateMachineEngine } from '../../src/services/job-state-machine.engine';
import { JobRepository } from '../../src/repositories/job.repository';
import { RetryPolicyService } from '../../src/services/retry-policy.service';
import { JobStatus, JobType, RetryStrategy } from '@prisma/client';

describe('Retry Engine Integration', () => {
  let retryEngine: RetryEngine;
  const suffix = Date.now().toString(36);
  let testQueueId = '';
  let testProjectId = '';
  let testOrgId = '';

  beforeAll(async () => {
    const jobRepo = new JobRepository(db);
    const stateMachine = new JobStateMachineEngine(jobRepo);
    const policyService = new RetryPolicyService(db);
    retryEngine = new RetryEngine(db, stateMachine, policyService);
    
    // Create Org, Project, RetryPolicy, Queue
    const org = await db.organization.create({
      data: {
        name: 'Retry Test Org',
        slug: `retry-test-org-${suffix}`,
      }
    });
    testOrgId = org.id;

    const project = await db.project.create({
      data: {
        organizationId: org.id,
        name: 'Retry Test Project',
        createdBy: 'system'
      }
    });
    testProjectId = project.id;

    const policy = await db.retryPolicy.create({
      data: {
        name: 'Standard Retry',
        organizationId: org.id,
        maxAttempts: 3,
        strategy: RetryStrategy.LINEAR_BACKOFF,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        jitterEnabled: false
      }
    });

    const queue = await db.queue.create({
      data: {
        projectId: project.id,
        name: 'test-retry-queue',
        retryPolicyId: policy.id
      }
    });
    testQueueId = queue.id;
  });

  afterAll(async () => {
    if (testQueueId) {
      await db.deadLetterQueue.deleteMany({ where: { queueId: testQueueId } });
      await db.job.deleteMany({ where: { queueId: testQueueId } });
      await db.queue.deleteMany({ where: { id: testQueueId } });
      await redis.del(`queue:${testQueueId}`);
    }
    if (testProjectId) await db.project.delete({ where: { id: testProjectId } });
    if (testOrgId) {
      await db.retryPolicy.deleteMany({ where: { organizationId: testOrgId } });
      await db.organization.delete({ where: { id: testOrgId } });
    }
  });

  it('should transition job to RETRY_WAITING and increment retryCount', async () => {
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Failing Job',
        payload: {},
        status: JobStatus.FAILED, // Setup as FAILED
        type: JobType.IMMEDIATE,
        maxRetries: 3,
        retryCount: 0
      }
    });

    await retryEngine.evaluateFailedJob(job.id, 'UNKNOWN_ERROR', 'Failed to execute');

    const dbJob = await db.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).toBe(JobStatus.RETRY_WAITING);
    expect(dbJob?.retryCount).toBe(1);
    expect(dbJob?.nextRunAt).not.toBeNull();
  });

  it('should transition job to DLQ if maxRetries exceeded', async () => {
    const job = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Exhausted Job',
        payload: {},
        status: JobStatus.FAILED, // Setup as FAILED
        type: JobType.IMMEDIATE,
        maxRetries: 3,
        retryCount: 3 // Already hit max
      }
    });

    await retryEngine.evaluateFailedJob(job.id, 'UNKNOWN_ERROR', 'Failed to execute');

    const dbJob = await db.job.findUnique({ where: { id: job.id } });
    expect(dbJob?.status).toBe(JobStatus.DLQ);
    
    const dlqEntry = await db.deadLetterQueue.findUnique({ where: { jobId: job.id } });
    expect(dlqEntry).not.toBeNull();
    expect(dlqEntry?.reason).toBe('MAX_RETRIES_EXCEEDED');
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma as db } from '../../src/database/db';
import { SchedulerEngine } from '../../src/services/scheduler.engine';
import { JobStateMachineEngine } from '../../src/services/job-state-machine.engine';
import { JobRepository } from '../../src/repositories/job.repository';
import { JobType, JobStatus } from '@prisma/client';
import { redis } from '../../src/config/redis';

describe('Scheduler Integration', () => {
  let scheduler: SchedulerEngine;
  let testQueueId: string;
  let testProjectId: string;

  beforeAll(async () => {
    const jobRepo = new JobRepository(db);
    const stateMachine = new JobStateMachineEngine(jobRepo);
    scheduler = new SchedulerEngine(db, stateMachine, 1000);
    
    // Create Org, Project, Queue
    const org = await db.organization.create({
      data: {
        name: 'Scheduler Test Org',
        slug: 'scheduler-test-org',
      }
    });

    const project = await db.project.create({
      data: {
        organizationId: org.id,
        name: 'Scheduler Test Project',
        createdBy: 'system'
      }
    });
    testProjectId = project.id;

    const queue = await db.queue.create({
      data: {
        projectId: project.id,
        name: 'test-scheduler-queue',
        configuration: {
          create: {}
        }
      }
    });
    testQueueId = queue.id;
    
    // Make sure redis stream group exists for some arbitrary worker
    try {
      await redis.xgroup('CREATE', `queue:${queue.id}`, 'djs_workers', '0', 'MKSTREAM');
    } catch(e: any) {
      if (!e.message.includes('BUSYGROUP')) throw e;
    }
  });

  afterAll(async () => {
    await db.job.deleteMany({ where: { queueId: testQueueId } });
    await db.queue.deleteMany({ where: { id: testQueueId } });
    await db.project.delete({ where: { id: testProjectId } });
    await db.organization.deleteMany({ where: { slug: 'scheduler-test-org' } });
    await redis.del(`queue:${testQueueId}`);
  });

  it('should process delayed jobs and transition them to QUEUED', async () => {
    // 1. Create a scheduled job that is past due
    const job1 = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Past Due Job',
        payload: { task: 'delayed' },
        status: JobStatus.SCHEDULED,
        type: JobType.DELAYED,
        maxRetries: 3,
        nextRunAt: new Date(Date.now() - 10000) // 10s ago
      }
    });

    // 2. Create a scheduled job that is NOT past due
    const job2 = await db.job.create({
      data: {
        queueId: testQueueId,
        name: 'Future Job',
        payload: { task: 'delayed' },
        status: JobStatus.SCHEDULED,
        type: JobType.DELAYED,
        maxRetries: 3,
        nextRunAt: new Date(Date.now() + 100000) // Future
      }
    });

    // 3. Process scheduled jobs
    const processed = await scheduler.processScheduledJobs();
    
    expect(processed).toBe(1);

    // 4. Verify DB State
    const dbJob1 = await db.job.findUnique({ where: { id: job1.id } });
    expect(dbJob1?.status).toBe(JobStatus.QUEUED);

    const dbJob2 = await db.job.findUnique({ where: { id: job2.id } });
    expect(dbJob2?.status).toBe(JobStatus.SCHEDULED);

    // 5. Verify Redis State (Stream should contain job1)
    const streamInfo = await redis.xlen(`queue:${testQueueId}`);
    expect(streamInfo).toBe(1);
    
    const messages = await redis.xrange(`queue:${testQueueId}`, '-', '+');
    expect(messages.length).toBe(1);
    
    const kv = messages[0][1];
    expect(kv[1]).toBe(job1.id);
  });
});

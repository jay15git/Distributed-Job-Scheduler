import { JobStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { redis } from '../config/redis';

export class SchedulerEngine {
  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine,
    private readonly batchSize: number = 1000
  ) {}

  /**
   * 4C: Cron & Delayed Jobs
   * Processes delayed and scheduled jobs in safe, transactional batches.
   * Runs on a frequent tick (e.g., 5 seconds).
   */
  async processScheduledJobs() {
    // Note: In reality, we'd acquire a Redlock here to ensure only one scheduler instance processes at a time.
    // await redisClient.acquireLock('scheduler:scheduled-jobs');

    let processedCount = 0;
    let hasMore = true;

    while (hasMore) {
      // 1. Fetch batch
      const jobRows = await this.db.$queryRaw<{ id: string, queueId: string }[]>`
        SELECT id, "queueId" FROM "Job"
        WHERE status = CAST(${JobStatus.SCHEDULED} AS "JobStatus")
          AND "nextRunAt" <= NOW()
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED;
      `;

      if (jobRows.length === 0) {
        hasMore = false;
        break;
      }

      const transitionPromises = jobRows.map(async (job) => {
        try {
          await this.stateMachine.transitionJobState({
            jobId: job.id,
            expectedState: JobStatus.SCHEDULED,
            nextState: JobStatus.QUEUED,
            actor: 'system:scheduler',
            reason: 'Scheduled time reached',
          });
          // Publish to Redis
          await redis.xadd(`queue:${job.queueId}`, '*', 'jobId', job.id);
        } catch (err) {
          console.error(`Failed to transition scheduled job ${job.id}:`, err);
        }
      });
      
      await Promise.all(transitionPromises);

      processedCount += jobRows.length;
    }

    return processedCount;
  }
}

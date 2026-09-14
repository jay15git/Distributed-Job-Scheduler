import { JobStatus, JobType } from '@prisma/client';
import { TransactionClient, runInTransaction } from '../database/db';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import * as metrics from '../config/metrics';
import * as cronParser from 'cron-parser';

export class SchedulerEngine {
  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine,
    private readonly batchSize: number = 1000
  ) {}

  /**
   * 4C: Cron & Delayed Jobs
   * Promotes due jobs to QUEUED in atomic batch claims.
   *
   * Covers two populations keyed off nextRunAt:
   *   - SCHEDULED      (delayed one-off and cron-materialized jobs)
   *   - RETRY_WAITING  (backoff elapsed, ready for another attempt)
   *
   * The claim runs inside a transaction so FOR UPDATE SKIP LOCKED actually
   * serializes against other scheduler replicas — in autocommit the row locks
   * would release the moment the SELECT returned, making them decorative.
   */
  async processScheduledJobs() {
    let processedCount = 0;

    while (true) {
      const claimed = await runInTransaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; queueId: string; status: JobStatus }[]>`
          SELECT id, "queueId", status FROM "Job"
          WHERE status IN (
              CAST(${JobStatus.SCHEDULED} AS "JobStatus"),
              CAST(${JobStatus.RETRY_WAITING} AS "JobStatus")
            )
            AND "nextRunAt" <= NOW()
          ORDER BY "nextRunAt" ASC
          LIMIT ${this.batchSize}
          FOR UPDATE SKIP LOCKED
        `;

        if (rows.length === 0) return [];

        const ids = rows.map(r => r.id);
        await tx.job.updateMany({
          where: { id: { in: ids } },
          data: { status: JobStatus.QUEUED, lockedBy: null, lockedAt: null },
        });
        await tx.jobExecutionHistory.createMany({
          data: rows.map(r => ({
            jobId: r.id,
            previousState: r.status,
            newState: JobStatus.QUEUED,
            actor: 'system:scheduler',
            reason: r.status === JobStatus.RETRY_WAITING
              ? 'Retry backoff elapsed'
              : 'Scheduled time reached',
          })),
        });
        return rows;
      });

      if (claimed.length === 0) break;

      // Notify workers AFTER commit. A lost notification is safe: the slow
      // sweeper republishes QUEUED jobs that drift too long without a claim.
      for (const job of claimed) {
        await redis.xadd(`queue:${job.queueId}`, 'MAXLEN', '~', '10000', '*', 'jobId', job.id)
          .catch(err => logger.error({ err, jobId: job.id }, 'Failed to publish queue notification'));
      }

      metrics.scheduledJobsProcessedTotal.inc(claimed.length);
      processedCount += claimed.length;
      if (claimed.length < this.batchSize) break;
    }

    return processedCount;
  }

  /**
   * Cron materializer.
   * Turns due recurring schedules (ScheduledJob.cronExpression) into real Job
   * rows and rolls nextRunAt forward. Same SKIP LOCKED batch claim makes it
   * safe to run on multiple scheduler replicas.
   */
  async processCronSchedules() {
    const created = await runInTransaction(async (tx) => {
      const schedules = await tx.$queryRaw<{
        id: string;
        projectId: string;
        name: string;
        cronExpression: string;
        timezone: string;
        payload: any;
        queueId: string | null;
      }[]>`
        SELECT id, "projectId", name, "cronExpression", timezone, payload, "queueId"
        FROM "ScheduledJob"
        WHERE status = 'ACTIVE' AND "nextRunAt" <= NOW()
        ORDER BY "nextRunAt" ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      if (schedules.length === 0) return [];

      const jobsToNotify: { id: string; queueId: string }[] = [];

      for (const sched of schedules) {
        // Roll forward first — a bad cron expression must not hot-loop the tick.
        let nextRunAt: Date;
        try {
          nextRunAt = cronParser
            .parseExpression(sched.cronExpression, { tz: sched.timezone || 'UTC' })
            .next()
            .toDate();
        } catch (err) {
          logger.error({ err, scheduleId: sched.id, cron: sched.cronExpression },
            'Invalid cron expression; marking schedule ERROR');
          await tx.scheduledJob.update({
            where: { id: sched.id },
            data: { status: 'ERROR' },
          });
          continue;
        }

        const queueId = sched.queueId ?? (await tx.projectSetting.findUnique({
          where: { projectId: sched.projectId },
          select: { defaultQueueId: true },
        }))?.defaultQueueId;

        if (!queueId) {
          logger.error({ scheduleId: sched.id, projectId: sched.projectId },
            'Schedule has no target queue and project has no defaultQueueId; marking ERROR');
          await tx.scheduledJob.update({
            where: { id: sched.id },
            data: { status: 'ERROR' },
          });
          continue;
        }

        const job = await tx.job.create({
          data: {
            queueId,
            name: sched.name,
            payload: sched.payload,
            type: JobType.CRON,
            status: JobStatus.QUEUED,
            maxRetries: 3,
            correlationId: `cron-${sched.id}`,
          },
        });

        await tx.jobExecutionHistory.create({
          data: {
            jobId: job.id,
            previousState: null,
            newState: JobStatus.QUEUED,
            actor: 'system:cron-materializer',
            reason: `Materialized from schedule ${sched.id} (${sched.cronExpression})`,
          },
        });

        await tx.scheduledJob.update({
          where: { id: sched.id },
          data: { lastRunAt: new Date(), nextRunAt },
        });

        jobsToNotify.push({ id: job.id, queueId });
      }

      return jobsToNotify;
    });

    for (const job of created) {
      await redis.xadd(`queue:${job.queueId}`, 'MAXLEN', '~', '10000', '*', 'jobId', job.id)
        .catch(err => logger.error({ err, jobId: job.id }, 'Failed to publish cron job notification'));
    }

    return created.length;
  }
}

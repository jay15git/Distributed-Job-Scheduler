import { JobStatus, WorkerStatus } from '@prisma/client';
import { TransactionClient, runInTransaction } from '../database/db';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { QueueMetricsService } from './queue-metrics.service';
import { RetryEngine } from './retry.engine';
import { DependencyEngine } from './dependency.engine';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import * as metrics from '../config/metrics';

export class RecoveryEngine {
  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine,
    private readonly metricsService: QueueMetricsService,
    private readonly retryEngine?: RetryEngine,
    private readonly dependencyEngine?: DependencyEngine
  ) {}

  /**
   * 4G: Fast Sweeper
   * Runs every few seconds. Responsible for SLA recoveries.
   *
   * Timeout values come from each queue's QueueConfiguration row; the
   * COALESCE fallbacks match the schema defaults (5s claim, 30s heartbeat).
   */
  async executeFastSweep() {
    // 1. Claim Timeout Recovery (stuck in CLAIMED past the queue's claimTimeout)
    const claimStalledJobs = await this.db.$queryRaw<{ id: string; queueId: string }[]>`
      SELECT j.id, j."queueId" FROM "Job" j
      LEFT JOIN "QueueConfiguration" qc ON qc."queueId" = j."queueId"
      WHERE j.status = CAST(${JobStatus.CLAIMED} AS "JobStatus")
        AND j."lockedAt" < NOW() - COALESCE(qc."claimTimeout", 5000) * INTERVAL '1 millisecond'
      LIMIT 1000;
    `;

    for (const job of claimStalledJobs) {
      try {
        // lockedBy: null also clears lockedAt (repository invariant)
        await this.stateMachine.transitionJobState({
          jobId: job.id,
          expectedState: JobStatus.CLAIMED,
          nextState: JobStatus.QUEUED,
          actor: 'system:fast-sweeper',
          reason: 'Claim timeout breached',
          lockedBy: null,
        });
        // The original stream entry is still PENDING on the dead consumer and
        // is never reclaimed — publish a fresh notification for the re-queued job.
        await redis.xadd(`queue:${job.queueId}`, '*', 'jobId', job.id);
      } catch (e) {
        logger.error({ err: e, jobId: job.id }, 'Claim-timeout recovery failed');
      }
    }

    // 2. Heartbeat Timeout Recovery (RUNNING jobs whose heartbeat went stale)
    const heartbeatStalledJobs = await this.db.$queryRaw<{ id: string }[]>`
      SELECT j.id FROM "Job" j
      LEFT JOIN "QueueConfiguration" qc ON qc."queueId" = j."queueId"
      WHERE j.status = CAST(${JobStatus.RUNNING} AS "JobStatus")
        AND COALESCE(j."lastHeartbeat", j."updatedAt")
            < NOW() - COALESCE(qc."heartbeatTimeout", 30000) * INTERVAL '1 millisecond'
      LIMIT 1000;
    `;

    for (const job of heartbeatStalledJobs) {
      try {
        await this.stateMachine.transitionJobState({
          jobId: job.id,
          expectedState: JobStatus.RUNNING,
          nextState: JobStatus.FAILED,
          actor: 'system:fast-sweeper',
          reason: 'Heartbeat timeout breached',
        });
        await this.retryEngine?.evaluateFailedJob(job.id, 'HEARTBEAT_TIMEOUT', 'Job heartbeat timed out')
          .catch(e => logger.error({ err: e, jobId: job.id }, 'RetryEngine evaluation failed'));
      } catch (e) {
        logger.error({ err: e, jobId: job.id }, 'Heartbeat-timeout recovery failed');
      }
    }

    // 2b. Stuck CANCELLING — the owning worker died or never observed the
    //     flag. Same staleness signal as RUNNING reaping, but the outcome is
    //     CANCELLED, not FAILED/retry.
    const cancellingStalledJobs = await this.db.$queryRaw<{ id: string }[]>`
      SELECT j.id FROM "Job" j
      LEFT JOIN "QueueConfiguration" qc ON qc."queueId" = j."queueId"
      WHERE j.status = CAST(${JobStatus.CANCELLING} AS "JobStatus")
        AND COALESCE(j."lastHeartbeat", j."updatedAt")
            < NOW() - COALESCE(qc."heartbeatTimeout", 30000) * INTERVAL '1 millisecond'
      LIMIT 1000;
    `;

    for (const job of cancellingStalledJobs) {
      try {
        await this.stateMachine.transitionJobState({
          jobId: job.id,
          expectedState: JobStatus.CANCELLING,
          nextState: JobStatus.CANCELLED,
          actor: 'system:fast-sweeper',
          reason: 'Cancellation completed after worker heartbeat timeout',
        });
      } catch (e) {
        logger.error({ err: e, jobId: job.id }, 'CANCELLING recovery failed');
      }
    }

    // 3. Unevaluated FAILED jobs — covers workers without a wired RetryEngine
    //    and crashes between the FAILED transition and evaluation.
    const failedJobs = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Job"
      WHERE status = CAST(${JobStatus.FAILED} AS "JobStatus")
      LIMIT 1000;
    `;

    for (const job of failedJobs) {
      await this.retryEngine?.evaluateFailedJob(job.id, 'UNEVALUATED_FAILURE', 'Evaluated by recovery sweeper')
        .catch(e => logger.error({ err: e, jobId: job.id }, 'RetryEngine sweep evaluation failed'));
    }

    // 4. DAG orphan cascade — BLOCKED children of permanently-dead parents
    //    (DLQ / CANCELLED / ARCHIVED) are cancelled so they can't hang forever.
    if (this.dependencyEngine) {
      await this.dependencyEngine.cancelOrphans()
        .catch(e => logger.error({ err: e }, 'Orphan cancellation failed'));
    }

    // 5. Stale worker detection — a worker that stops heartbeating is OFFLINE;
    //    its in-flight jobs are recovered by passes 1 and 2.
    await this.db.worker.updateMany({
      where: {
        status: WorkerStatus.ONLINE,
        lastSeen: { lt: new Date(Date.now() - 30_000) },
      },
      data: { status: WorkerStatus.OFFLINE },
    }).catch(e => logger.error({ err: e }, 'Stale worker sweep failed'));
  }

  /**
   * 4F: Slow Sweeper & Queue Sync
   * Runs every few minutes. Responsible for Queue Sync, metrics cleanup,
   * heartbeat pruning, and retention-based archival.
   */
  async executeSlowSweep() {
    const start = Date.now();

    // 1. Queue Synchronization (Drift Recovery)
    // QUEUED jobs idle too long almost certainly lost their Redis notification
    // (worker down at publish time, XADD failure, trimmed stream). Republish.
    // Duplicates are safe: a stale duplicate fails the QUEUED -> CLAIMED
    // optimistic transition and is xacked away.
    const driftedJobs = await this.db.$queryRaw<{ id: string; queueId: string }[]>`
      SELECT id, "queueId" FROM "Job"
      WHERE status = CAST(${JobStatus.QUEUED} AS "JobStatus")
        AND "updatedAt" < NOW() - INTERVAL '5 minutes'
      LIMIT 1000;
    `;

    for (const job of driftedJobs) {
      await redis.xadd(`queue:${job.queueId}`, '*', 'jobId', job.id)
        .catch(e => logger.error({ err: e, jobId: job.id }, 'Drift republish failed'));
    }
    if (driftedJobs.length > 0) {
      metrics.queueSyncTotal.inc();
      logger.info({ count: driftedJobs.length }, 'Republished drifted QUEUED jobs');
    }

    // 2. Metrics Cleanup
    const activeQueues = await this.db.queue.findMany({ select: { id: true } });
    for (const queue of activeQueues) {
      await this.metricsService.aggregateAndPurgeMetrics(queue.id)
        .catch(e => logger.error({ err: e, queueId: queue.id }, 'Metrics purge failed'));
    }

    // 3. Worker heartbeat pruning — cap the table at ~24h of history
    await this.db.workerHeartbeat.deleteMany({
      where: { timestamp: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }).catch(e => logger.error({ err: e }, 'Heartbeat prune failed'));

    // 4. Retention-based archival: terminal jobs older than the queue's
    //    retention window -> ARCHIVED (with history rows for auditability).
    const archivable = await this.db.$queryRaw<{ id: string; status: JobStatus }[]>`
      SELECT j.id, j.status FROM "Job" j
      LEFT JOIN "QueueConfiguration" qc ON qc."queueId" = j."queueId"
      WHERE j.status IN (
          CAST(${JobStatus.COMPLETED} AS "JobStatus"),
          CAST(${JobStatus.CANCELLED} AS "JobStatus"),
          CAST(${JobStatus.DLQ} AS "JobStatus")
        )
        AND j."updatedAt" < NOW() - (
          CASE WHEN j.status = CAST(${JobStatus.DLQ} AS "JobStatus")
               THEN COALESCE(qc."dlqRetentionDays", 30)
               ELSE COALESCE(qc."jobRetentionDays", 7)
          END
        ) * INTERVAL '1 day'
      LIMIT 1000;
    `;

    if (archivable.length > 0) {
      const ids = archivable.map(j => j.id);
      await runInTransaction(async (tx) => {
        await tx.job.updateMany({
          where: { id: { in: ids } },
          data: { status: JobStatus.ARCHIVED },
        });
        await tx.jobExecutionHistory.createMany({
          data: archivable.map(j => ({
            jobId: j.id,
            previousState: j.status,
            newState: JobStatus.ARCHIVED,
            actor: 'system:slow-sweeper',
            reason: 'Retention period expired',
          })),
        });
      });
    }

    metrics.queueSyncDurationSeconds.observe((Date.now() - start) / 1000);
  }
}

import { JobStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { QueueMetricsService } from './queue-metrics.service';

export class RecoveryEngine {
  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine,
    private readonly metricsService: QueueMetricsService
  ) {}

  /**
   * 4G: Fast Sweeper
   * Runs every few seconds. Responsible for SLA recoveries.
   */
  async executeFastSweep() {
    // 1. Claim Timeout Recovery (Stuck in CLAIMED)
    // Assume global claimTimeout is 5 seconds if not using queue-specific config
    const claimStalledJobs = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Job"
      WHERE status = ${JobStatus.CLAIMED}
        AND "lockedAt" < NOW() - INTERVAL '5 seconds'
      LIMIT 1000;
    `;

    for (const job of claimStalledJobs) {
      await this.stateMachine.transitionJobState({
        jobId: job.id,
        expectedState: JobStatus.CLAIMED,
        nextState: JobStatus.QUEUED,
        actor: 'system:fast-sweeper',
        reason: 'Claim timeout breached',
      }).catch(e => console.error(e));
    }

    // 2. Heartbeat Timeout Recovery (Stuck in RUNNING)
    // Assume global heartbeatTimeout is 30 seconds
    const heartbeatStalledJobs = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Job"
      WHERE status = ${JobStatus.RUNNING}
        AND "updatedAt" < NOW() - INTERVAL '30 seconds'
      LIMIT 1000;
    `;

    for (const job of heartbeatStalledJobs) {
      await this.stateMachine.transitionJobState({
        jobId: job.id,
        expectedState: JobStatus.RUNNING,
        nextState: JobStatus.FAILED,
        actor: 'system:fast-sweeper',
        reason: 'Heartbeat timeout breached',
      }).catch(e => console.error(e));
      
      // Note: The orchestrator loop would eventually pick up this FAILED job and pass it to RetryEngine
    }
  }

  /**
   * 4F: Slow Sweeper & Queue Sync
   * Runs every few minutes. Responsible for Queue Sync, metrics cleanup, and archival.
   */
  async executeSlowSweep() {
    // 1. Queue Synchronization (Drift Recovery)
    // Find jobs stuck in QUEUED for > 5 minutes.
    const driftedJobs = await this.db.$queryRaw<{ id: string, queueId: string }[]>`
      SELECT id, "queueId" FROM "Job"
      WHERE status = ${JobStatus.QUEUED}
        AND "updatedAt" < NOW() - INTERVAL '5 minutes'
      LIMIT 1000;
    `;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _job of driftedJobs) {
      // 1a. Verify Redis (Simulated)
      // const isInRedis = await redisClient.xpending(job.queueId, job.id);
      
      // 1b. If missing, republish
      // if (!isInRedis) {
      //   await redisClient.xadd(job.queueId, '*', 'jobId', job.id);
      //   await this.insertAuditLog('QueueSync Triggered', job.id);
      // }
    }

    // 2. Metrics Cleanup
    // Retrieve all active queues to run aggregation
    const activeQueues = await this.db.queue.findMany({ select: { id: true }});
    for (const queue of activeQueues) {
      await this.metricsService.aggregateAndPurgeMetrics(queue.id).catch(e => console.error(e));
    }

    // 3. DLQ and Job Archival (Not fully implemented, but structural placeholder)
    // - Move COMPLETED/CANCELLED/DLQ jobs older than retention period to ARCHIVED
    // - Cleanup ancient ARCHIVED jobs
  }
}

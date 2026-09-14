import { JobStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * DAG dependency engine. A job enqueued with `dependsOn` parents starts in
 * BLOCKED and is released to QUEUED once every parent reaches COMPLETED.
 * If any parent lands in a terminal non-success state (DLQ, CANCELLED,
 * ARCHIVED), the child is CANCELLED — a DAG with a failed prerequisite can
 * never run.
 */
export class DependencyEngine {
  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine
  ) {}

  /**
   * Call after a job reaches COMPLETED. Releases each direct child whose
   * remaining parents are also COMPLETED.
   */
  async releaseDependents(parentJobId: string) {
    const links = await this.db.jobDependency.findMany({
      where: { parentJobId },
      select: { childJobId: true },
    });

    for (const { childJobId } of links) {
      const child = await this.db.job.findUnique({
        where: { id: childJobId },
        select: { id: true, status: true, queueId: true },
      });
      if (!child || child.status !== JobStatus.BLOCKED) continue;

      // All parents must be COMPLETED for the child to fire.
      const incompleteParents = await this.db.jobDependency.count({
        where: {
          childJobId,
          parentJob: { status: { not: JobStatus.COMPLETED } },
        },
      });
      if (incompleteParents > 0) continue;

      try {
        await this.stateMachine.transitionJobState({
          jobId: childJobId,
          expectedState: JobStatus.BLOCKED,
          nextState: JobStatus.QUEUED,
          actor: 'dependency-engine',
          reason: 'All dependencies completed',
        });
        await redis.xadd(`queue:${child.queueId}`, 'MAXLEN', '~', '10000', '*', 'jobId', childJobId);
      } catch (err: any) {
        logger.error({ err, childJobId }, 'Failed to release dependent job');
      }
    }
  }

  /**
   * Missed-release repair: a parent can complete between the enqueue-time
   * parent check and the edge commit, so its releaseDependents ran before
   * the edge existed. This sweep pass releases any BLOCKED child whose
   * parents are now all COMPLETED.
   */
  async releaseReady() {
    const ready = await this.db.job.findMany({
      where: {
        status: JobStatus.BLOCKED,
        dependencies: { some: {} },
        NOT: {
          dependencies: {
            some: { parentJob: { status: { not: JobStatus.COMPLETED } } },
          },
        },
      },
      select: { id: true, queueId: true },
      take: 100,
    });

    for (const child of ready) {
      try {
        await this.stateMachine.transitionJobState({
          jobId: child.id,
          expectedState: JobStatus.BLOCKED,
          nextState: JobStatus.QUEUED,
          actor: 'dependency-engine',
          reason: 'All dependencies completed (sweeper release)',
        });
        await redis.xadd(`queue:${child.queueId}`, 'MAXLEN', '~', '10000', '*', 'jobId', child.id);
      } catch (err: any) {
        logger.error({ err, childJobId: child.id }, 'Sweeper release failed');
      }
    }

    return ready.length;
  }

  /**
   * Cancels BLOCKED children of jobs that died permanently. Sweeper calls
   * this for parents in DLQ / CANCELLED / ARCHIVED so the cascade stays
   * out of the hot worker path.
   */
  async cancelOrphans() {
    const orphans = await this.db.jobDependency.findMany({
      where: {
        parentJob: { status: { in: [JobStatus.DLQ, JobStatus.CANCELLED, JobStatus.ARCHIVED] } },
        childJob: { status: JobStatus.BLOCKED },
      },
      select: { childJobId: true, parentJobId: true },
    });

    for (const { childJobId } of orphans) {
      try {
        await this.stateMachine.transitionJobState({
          jobId: childJobId,
          expectedState: JobStatus.BLOCKED,
          nextState: JobStatus.CANCELLED,
          actor: 'dependency-engine',
          reason: 'Parent job terminated without completing',
        });
      } catch (err: any) {
        logger.error({ err, childJobId }, 'Failed to cancel orphaned job');
      }
    }

    return orphans.length;
  }
}

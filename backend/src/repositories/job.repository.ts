import { JobStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';

export class JobRepository {
  constructor(private readonly db: TransactionClient) {}

  async createJob(data: {
    queueId: string;
    name: string;
    payload: any;
    priority?: number;
    status?: JobStatus;
    type?: any;
    maxRetries?: number;
    nextRunAt?: Date;
  }) {
    return this.db.job.create({
      data: {
        queueId: data.queueId,
        name: data.name,
        payload: data.payload,
        priority: data.priority ?? 5, // NORMAL
        status: data.status ?? JobStatus.QUEUED,
        maxRetries: data.maxRetries ?? 3,
        nextRunAt: data.nextRunAt,
      },
    });
  }

  async getJobById(id: string) {
    return this.db.job.findUnique({
      where: { id },
    });
  }

  /**
   * Atomically claims the highest-priority QUEUED job for a queue.
   * Single statement: the sub-select picks the best candidate with
   * FOR UPDATE SKIP LOCKED so competing workers never collide.
   */
  async claimNextQueuedJob(queueId: string, workerId: string) {
    const claimed = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE "Job"
      SET "status"    = 'CLAIMED'::"JobStatus",
          "lockedBy"  = ${workerId},
          "lockedAt"  = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = (
        SELECT "id" FROM "Job"
        WHERE "status" = 'QUEUED'::"JobStatus" AND "queueId" = ${queueId}
        ORDER BY "priority" DESC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING "id";
    `;
    return claimed[0] ?? null;
  }

  /**
   * Only to be called by the State Machine Engine.
   */
  async updateJobStatusAndRecordHistory(
    jobId: string,
    expectedState: JobStatus,
    nextState: JobStatus,
    actor?: string,
    reason?: string,
    metadata?: any,
    lockedBy?: string | null
  ) {
    // If this is already a transaction client, just execute directly.
    // In our setup, TransactionClient is typically used inside a larger transaction or just the prisma client.
    // 1. Optimistic lock via updateMany
    const result = await this.db.job.updateMany({
      where: {
        id: jobId,
        status: expectedState,
      },
      data: {
        status: nextState,
        updatedAt: new Date(),
        ...(lockedBy !== undefined
          ? {
              lockedBy,
              // Claim stamp drives claim-timeout recovery; releasing clears it.
              lockedAt: lockedBy === null ? null : new Date(),
            }
          : {}),
      },
    });

    if (result.count === 0) {
      throw new Error(`Job state transition failed. Job ${jobId} not in expected state ${expectedState}.`);
    }

    // 2. Insert history record
    await this.db.jobExecutionHistory.create({
      data: {
        jobId,
        previousState: expectedState,
        newState: nextState,
        actor,
        reason,
        metadata: metadata || {},
      },
    });

    return result;
  }
}

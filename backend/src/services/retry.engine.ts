import { JobStatus, RetryStrategy, Job } from '@prisma/client';
import { TransactionClient, runInTransaction } from '../database/db';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { RetryPolicyService } from './retry-policy.service';

export class RetryEngine {
  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine,
    private readonly retryPolicyService: RetryPolicyService
  ) {}

  /**
   * 4D: Retry Engine
   * Evaluates a failed job against its queue's Retry Policy.
   * Calculates the next delay (Fixed, Linear, Exponential + Jitter).
   */
  async evaluateFailedJob(jobId: string, errorCode: string, errorMessage: string) {
    const job = await this.db.job.findUnique({
      where: { id: jobId },
      include: { queue: { include: { retryPolicy: true } } }
    });

    if (!job) throw new Error('Job not found');
    const policy = job.queue.retryPolicy;

    // No policy attached or max retries exceeded
    if (!policy || job.retryCount >= job.maxRetries || job.retryCount >= policy.maxAttempts) {
      return this.sendToDLQ(job, 'MAX_RETRIES_EXCEEDED', errorCode, errorMessage);
    }

    // Check if error code is retryable
    if (!this.retryPolicyService.isRetryable(policy, errorCode)) {
      return this.sendToDLQ(job, 'NON_RETRYABLE_ERROR', errorCode, errorMessage);
    }

    // Calculate backoff
    const nextRunAt = this.calculateNextRunAt(policy, job.retryCount);

    // Single guarded write: status flip + retryCount increment + nextRunAt are
    // one atomic updateMany. If the job left FAILED meanwhile (cancel, a
    // concurrent evaluator), count===0 aborts the whole tx — retryCount can
    // never be double-incremented for one failure.
    await runInTransaction(async (tx) => {
      const res = await tx.job.updateMany({
        where: { id: job.id, status: JobStatus.FAILED },
        data: {
          status: JobStatus.RETRY_WAITING,
          retryCount: { increment: 1 },
          nextRunAt,
        },
      });
      if (res.count === 0) {
        throw new Error(`Job ${job.id} left FAILED before retry evaluation committed`);
      }
      await tx.jobExecutionHistory.create({
        data: {
          jobId: job.id,
          previousState: JobStatus.FAILED,
          newState: JobStatus.RETRY_WAITING,
          actor: 'system:retry-engine',
          reason: `Retrying (${job.retryCount + 1}/${job.maxRetries}). Error: ${errorCode}`,
        },
      });
    });
  }

  private calculateNextRunAt(policy: any, currentAttempt: number): Date {
    let delay = policy.initialDelayMs;

    if (policy.strategy === RetryStrategy.LINEAR_BACKOFF) {
      delay = policy.initialDelayMs * (currentAttempt + 1);
    } else if (policy.strategy === RetryStrategy.EXPONENTIAL_BACKOFF) {
      delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, currentAttempt);
    }

    if (delay > policy.maxDelayMs) {
      delay = policy.maxDelayMs;
    }

    if (policy.jitterEnabled) {
      const jitterAmount = delay * policy.jitterPercentage;
      const randomJitter = (Math.random() * 2 - 1) * jitterAmount; // +/- jitter
      delay += randomJitter;
    }

    return new Date(Date.now() + delay);
  }

  /**
   * 4E: DLQ Manager
   */
  private async sendToDLQ(
    job: Job & { queue?: { name?: string } },
    reason: string,
    errorCode: string,
    finalException: string
  ) {
    // Transition to DLQ
    await this.stateMachine.transitionJobState({
      jobId: job.id,
      expectedState: JobStatus.FAILED,
      nextState: JobStatus.DLQ,
      actor: 'system:dlq-manager',
      reason,
    });

    const failureCategory =
      errorCode === 'EXEC_TIMEOUT' || errorCode === 'HEARTBEAT_TIMEOUT'
        ? 'TIMEOUT'
        : errorCode === 'NON_RETRYABLE_ERROR' || reason === 'NON_RETRYABLE_ERROR'
          ? 'VALIDATION'
          : 'EXECUTION_ERROR';

    // Upsert the forensics row — a replayed job can re-enter the DLQ and its
    // previous entry must be refreshed, not crash on the jobId unique key.
    const dlqData = {
      queueId: job.queueId,
      originalQueueName: job.queue?.name ?? null,
      originalWorkerId: job.lockedBy,
      retryCount: job.retryCount,
      reason,
      failureCategory,
      failureSummary: finalException,
      finalException: JSON.parse(JSON.stringify(finalException)),
      recoveryRecommendation: 'Review logs and update payload or code',
      movedAt: new Date(),
    };
    await this.db.deadLetterQueue.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, ...dlqData },
      update: dlqData,
    });
  }
}

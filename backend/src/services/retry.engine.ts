import { JobStatus, RetryStrategy, Job } from '@prisma/client';
import { TransactionClient } from '../database/db';
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
      return this.sendToDLQ(job, 'MAX_RETRIES_EXCEEDED', errorMessage);
    }

    // Check if error code is retryable
    if (!this.retryPolicyService.isRetryable(policy, errorCode)) {
      return this.sendToDLQ(job, 'NON_RETRYABLE_ERROR', errorMessage);
    }

    // Calculate backoff
    const nextRunAt = this.calculateNextRunAt(policy, job.retryCount);

    // Update job (increment retry count and set nextRunAt)
    await this.db.job.update({
      where: { id: job.id },
      data: {
        retryCount: { increment: 1 },
        nextRunAt,
      }
    });

    // Transition state
    await this.stateMachine.transitionJobState({
      jobId: job.id,
      expectedState: JobStatus.FAILED,
      nextState: JobStatus.RETRY_WAITING,
      actor: 'system:retry-engine',
      reason: `Retrying (${job.retryCount + 1}/${job.maxRetries}). Error: ${errorCode}`,
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
  private async sendToDLQ(job: Job, reason: string, finalException: string) {
    // Transition to DLQ
    await this.stateMachine.transitionJobState({
      jobId: job.id,
      expectedState: JobStatus.FAILED,
      nextState: JobStatus.DLQ,
      actor: 'system:dlq-manager',
      reason,
    });

    // Upsert the forensics row — a replayed job can re-enter the DLQ and its
    // previous entry must be refreshed, not crash on the jobId unique key.
    const dlqData = {
      queueId: job.queueId,
      originalWorkerId: job.lockedBy,
      retryCount: job.retryCount,
      reason,
      failureCategory: 'EXECUTION_ERROR',
      finalException: JSON.parse(JSON.stringify(finalException)),
      recoveryRecommendation: 'Review logs and update payload or code',
      movedAt: new Date(),
    };
    await this.db.deadLetterQueue.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, originalQueueName: 'unknown-at-this-layer', ...dlqData },
      update: dlqData,
    });
  }
}

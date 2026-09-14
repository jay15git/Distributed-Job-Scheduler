import { JobStatus } from '@prisma/client';
import { JobRepository } from '../repositories/job.repository';

export const AllowedTransitions: Record<JobStatus, JobStatus[]> = {
  [JobStatus.QUEUED]: [JobStatus.CLAIMED, JobStatus.CANCELLED],
  [JobStatus.SCHEDULED]: [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.BLOCKED]: [JobStatus.QUEUED, JobStatus.CANCELLED], // DAG release / orphan cancel
  [JobStatus.CLAIMED]: [JobStatus.RUNNING, JobStatus.QUEUED], // Timeout -> QUEUED
  [JobStatus.RUNNING]: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLING],
  [JobStatus.CANCELLING]: [JobStatus.CANCELLED],
  [JobStatus.CANCELLED]: [JobStatus.ARCHIVED],
  [JobStatus.COMPLETED]: [JobStatus.ARCHIVED],
  [JobStatus.FAILED]: [JobStatus.RETRY_WAITING, JobStatus.DLQ],
  [JobStatus.RETRY_WAITING]: [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.DLQ]: [JobStatus.ARCHIVED, JobStatus.QUEUED], // Replay DLQ -> QUEUED
  [JobStatus.ARCHIVED]: [], // Terminal state
};

export class JobStateMachineEngine {
  constructor(private readonly jobRepo: JobRepository) {}

  /**
   * Centralized Transition Engine for Job States.
   * Ensures that all state transitions follow the defined DAG.
   */
  async transitionJobState(data: {
    jobId: string;
    expectedState: JobStatus;
    nextState: JobStatus;
    actor?: string;
    reason?: string;
    metadata?: any;
    lockedBy?: string | null;
  }) {
    const { jobId, expectedState, nextState, actor, reason, metadata, lockedBy } = data;

    // 1. Validate the DAG
    const allowed = AllowedTransitions[expectedState];
    if (!allowed || !allowed.includes(nextState)) {
      throw new Error(`Invalid state transition from ${expectedState} to ${nextState}`);
    }

    // 2. Perform the atomic update & insert history record
    return this.jobRepo.updateJobStatusAndRecordHistory(
      jobId,
      expectedState,
      nextState,
      actor,
      reason,
      metadata,
      lockedBy
    );
  }
}

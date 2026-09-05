import { QueueStatus } from '@prisma/client';
import { QueueRepository } from '../repositories/queue.repository';
import { RetryPolicyRepository } from '../repositories/retry-policy.repository';

export class QueueService {
  constructor(
    private readonly queueRepo: QueueRepository,
    private readonly retryPolicyRepo: RetryPolicyRepository
  ) {}

  async createQueue(data: {
    projectId: string;
    name: string;
    description?: string;
    retryPolicyId?: string;
    configuration?: any; // Contains fields for QueueConfiguration
  }) {
    if (data.retryPolicyId) {
      const policy = await this.retryPolicyRepo.getPolicyById(data.retryPolicyId);
      if (!policy) throw new Error('Invalid Retry Policy ID');
    }

    const queue = await this.queueRepo.createQueue({
      projectId: data.projectId,
      name: data.name,
      description: data.description,
      retryPolicyId: data.retryPolicyId,
    });

    // Apply configuration if provided, or defaults will be used by DB schema
    await this.queueRepo.createQueueConfiguration(queue.id, data.configuration || {});

    return this.queueRepo.getQueueById(queue.id);
  }

  async getQueue(queueId: string) {
    const queue = await this.queueRepo.getQueueById(queueId);
    if (!queue) throw new Error('Queue not found');
    return queue;
  }

  async listQueues(projectId: string, skip = 0, take = 50) {
    return this.queueRepo.listQueues(projectId, skip, take);
  }

  /**
   * Updates queue status with semantics enforcement.
   * - ACTIVE: accepts new jobs, workers consume
   * - PAUSED: accepts new jobs, workers DO NOT consume
   * - DRAINING: rejects new jobs, workers finish existing
   * - DISABLED: rejects new jobs, workers DO NOT consume
   * - ARCHIVED: terminal, historical
   */
  async updateQueueStatus(queueId: string, status: QueueStatus) {
    const queue = await this.queueRepo.getQueueById(queueId);
    if (!queue) throw new Error('Queue not found');

    if (queue.status === QueueStatus.ARCHIVED) {
      throw new Error('Cannot change status of an archived queue');
    }

    // Example logic: Ensure draining queues can only move to DISABLED or ARCHIVED
    if (queue.status === QueueStatus.DRAINING && status === QueueStatus.ACTIVE) {
      throw new Error('Cannot move a draining queue directly back to active');
    }

    return this.queueRepo.updateQueueStatus(queueId, status);
  }

  async updateQueueConfiguration(queueId: string, configuration: any) {
    const queue = await this.queueRepo.getQueueById(queueId);
    if (!queue) throw new Error('Queue not found');

    return this.queueRepo.updateQueueConfiguration(queueId, configuration);
  }

  async deleteQueue(queueId: string, deletedBy: string) {
    const queue = await this.queueRepo.getQueueById(queueId);
    if (!queue) throw new Error('Queue not found');
    if (queue.status !== QueueStatus.DISABLED && queue.status !== QueueStatus.ARCHIVED) {
      throw new Error('Queue must be DISABLED or ARCHIVED before deletion');
    }

    return this.queueRepo.softDeleteQueue(queueId, deletedBy);
  }
}

import { QueueStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';

export class QueueRepository {
  constructor(private readonly db: TransactionClient) {}

  async createQueue(data: {
    projectId: string;
    name: string;
    description?: string;
    retryPolicyId?: string;
  }) {
    return this.db.queue.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        description: data.description,
        retryPolicyId: data.retryPolicyId,
        status: QueueStatus.ACTIVE,
      },
    });
  }

  async createQueueConfiguration(queueId: string, data: any) {
    return this.db.queueConfiguration.create({
      data: {
        queueId,
        ...data,
      },
    });
  }

  async getQueueById(queueId: string) {
    return this.db.queue.findUnique({
      where: { id: queueId, deletedAt: null },
      include: {
        configuration: true,
        retryPolicy: true,
      },
    });
  }

  async listQueues(projectId: string, skip: number, take: number) {
    return this.db.queue.findMany({
      where: { projectId, deletedAt: null },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        configuration: true,
      }
    });
  }

  async updateQueueStatus(queueId: string, status: QueueStatus) {
    return this.db.queue.update({
      where: { id: queueId },
      data: { status },
    });
  }

  async updateQueueConfiguration(queueId: string, data: any) {
    return this.db.queueConfiguration.update({
      where: { queueId },
      data,
    });
  }

  async softDeleteQueue(queueId: string, deletedBy: string) {
    return this.db.queue.update({
      where: { id: queueId },
      data: { deletedAt: new Date(), deletedBy },
    });
  }
}

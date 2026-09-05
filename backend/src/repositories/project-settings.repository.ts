import { TransactionClient } from '../database/db';

export class ProjectSettingsRepository {
  constructor(private readonly db: TransactionClient) {}

  async upsertSettings(projectId: string, data: {
    defaultQueueId?: string;
    defaultRetryPolicyId?: string;
    defaultWorkerGroup?: string;
    defaultTimeZone?: string;
    defaultPriority?: number;
    defaultQueueVisibilityTimeout?: number;
    maxQueueSize?: number;
    maxConcurrentJobs?: number;
    jobRetentionDays?: number;
    dlqRetentionDays?: number;
    webhookUrl?: string;
  }) {
    return this.db.projectSetting.upsert({
      where: { projectId },
      create: {
        projectId,
        ...data,
      },
      update: {
        ...data,
      },
    });
  }

  async getSettings(projectId: string) {
    return this.db.projectSetting.findUnique({
      where: { projectId },
    });
  }
}

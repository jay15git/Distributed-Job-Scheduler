import { ProjectSettingsRepository } from '../repositories/project-settings.repository';

export class ProjectSettingsService {
  constructor(private readonly settingsRepo: ProjectSettingsRepository) {}

  async updateSettings(projectId: string, data: {
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
    return this.settingsRepo.upsertSettings(projectId, data);
  }

  async getSettings(projectId: string) {
    const settings = await this.settingsRepo.getSettings(projectId);
    
    // Return sensible defaults if settings don't exist yet
    if (!settings) {
      return {
        projectId,
        defaultTimeZone: 'UTC',
        defaultPriority: 0,
        defaultQueueVisibilityTimeout: 30000,
        maxQueueSize: 100000,
        maxConcurrentJobs: 1000,
        jobRetentionDays: 7,
        dlqRetentionDays: 30,
        defaultQueueId: null,
        defaultRetryPolicyId: null,
        defaultWorkerGroup: null,
        webhookUrl: null,
      };
    }

    return settings;
  }
}

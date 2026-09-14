import { apiClient } from '@/lib/api-client';

export interface ScheduledJob {
  id: string;
  projectId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  payload: Record<string, unknown>;
  queueId: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | string;
  createdAt: string;
  updatedAt: string;
}

export const scheduledJobsApi = {
  list: async (projectId?: string): Promise<ScheduledJob[]> => {
    const { data } = await apiClient.get('/scheduled-jobs', {
      params: projectId ? { projectId } : {},
    });
    return data;
  },
  create: async (body: {
    projectId: string;
    name: string;
    cronExpression: string;
    timezone?: string;
    queueId?: string;
    payload?: Record<string, unknown>;
  }): Promise<ScheduledJob> => {
    const { data } = await apiClient.post('/scheduled-jobs', body);
    return data;
  },
  updateStatus: async (id: string, status: 'ACTIVE' | 'PAUSED'): Promise<ScheduledJob> => {
    const { data } = await apiClient.patch(`/scheduled-jobs/${id}/status`, { status });
    return data;
  },
};

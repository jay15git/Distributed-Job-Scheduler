import { apiClient } from '@/lib/api-client';

export interface JobQueryFilters {
  queue?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

export const jobsApi = {
  getJobs: async (filters: JobQueryFilters = {}) => {
    const { data } = await apiClient.get('/jobs', { params: filters });
    return data;
  },

  createJob: async (jobData: any) => {
    const { data } = await apiClient.post('/jobs', jobData);
    return data;
  },

  getJobById: async (jobId: string) => {
    const { data } = await apiClient.get(`/jobs/${jobId}`);
    return data;
  },

  retryJob: async (jobId: string) => {
    const { data } = await apiClient.post(`/jobs/${jobId}/replay`);
    return data;
  },

  cancelJob: async (jobId: string) => {
    const { data } = await apiClient.post(`/jobs/${jobId}/cancel`);
    return data;
  }
};

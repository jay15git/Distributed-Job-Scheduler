import { apiClient } from '@/lib/api-client';

export const queuesApi = {
  getQueues: async () => {
    const { data } = await apiClient.get('/queues');
    return data;
  },

  getQueueByName: async (name: string) => {
    const { data } = await apiClient.get(`/queues/${name}`);
    return data;
  },

  pauseQueue: async (name: string) => {
    const { data } = await apiClient.post(`/queues/${name}/pause`);
    return data;
  },

  resumeQueue: async (name: string) => {
    const { data } = await apiClient.post(`/queues/${name}/resume`);
    return data;
  }
};

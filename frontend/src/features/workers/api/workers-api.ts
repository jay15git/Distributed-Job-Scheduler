import { apiClient } from '@/lib/api-client';

export const workersApi = {
  getWorkers: async () => {
    const { data } = await apiClient.get('/workers');
    return data;
  }
};

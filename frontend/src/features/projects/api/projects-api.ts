import { apiClient } from '@/lib/api-client';

export const projectsApi = {
  getProjects: async () => {
    const { data } = await apiClient.get('/projects');
    return data;
  },

  getProjectById: async (id: string) => {
    const { data } = await apiClient.get(`/projects/${id}`);
    return data;
  }
};

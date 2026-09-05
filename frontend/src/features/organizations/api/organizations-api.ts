import { apiClient } from '@/lib/api-client';

export const organizationsApi = {
  getOrganizations: async () => {
    const { data } = await apiClient.get('/organizations');
    return data;
  },

  getOrganizationById: async (id: string) => {
    const { data } = await apiClient.get(`/organizations/${id}`);
    return data;
  }
};

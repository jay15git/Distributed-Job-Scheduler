import { apiClient } from '@/lib/api-client';

export interface ApiKeyMeta {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  isRevoked: boolean;
  createdAt: string;
}

export interface ApiKeyCreated {
  apiKey: ApiKeyMeta;
  token: string; // raw djs_proj_... token — returned exactly once
}

export const apiKeysApi = {
  list: async (projectId: string): Promise<ApiKeyMeta[]> => {
    const { data } = await apiClient.get(`/projects/${projectId}/api-keys`);
    return data;
  },
  create: async (projectId: string, body: { name: string; scopes: string[]; expiresAt?: string }): Promise<ApiKeyCreated> => {
    const { data } = await apiClient.post(`/projects/${projectId}/api-keys`, body);
    return data;
  },
  revoke: async (id: string, reason?: string) => {
    const { data } = await apiClient.post(`/api-keys/${id}/revoke`, { reason });
    return data;
  },
  regenerate: async (id: string): Promise<ApiKeyCreated> => {
    const { data } = await apiClient.post(`/api-keys/${id}/regenerate`);
    return data;
  },
  remove: async (id: string) => {
    await apiClient.delete(`/api-keys/${id}`);
  },
};

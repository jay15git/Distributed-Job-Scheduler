import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '../api/organizations-api';

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.getOrganizations(),
    refetchInterval: 5000, // Keep consistent with other pages
  });
}

export function useOrganization(id: string) {
  return useQuery({
    queryKey: ['organization', id],
    queryFn: () => organizationsApi.getOrganizationById(id),
    enabled: !!id,
  });
}

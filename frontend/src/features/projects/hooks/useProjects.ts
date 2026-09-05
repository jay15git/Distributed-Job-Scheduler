import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/projects-api';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.getProjects(),
    refetchInterval: 5000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getProjectById(id),
    enabled: !!id,
  });
}

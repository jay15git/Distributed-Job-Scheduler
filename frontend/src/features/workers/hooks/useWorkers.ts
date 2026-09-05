import { useQuery } from '@tanstack/react-query';
import { workersApi } from '../api/workers-api';

export function useWorkers() {
  return useQuery({
    queryKey: ['workers'],
    queryFn: workersApi.getWorkers,
    refetchInterval: 5000, // Poll every 5 seconds for live dashboard
  });
}

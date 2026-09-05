import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi, JobQueryFilters } from '../api/jobs-api';

export function useJobs(filters: JobQueryFilters = {}) {
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => jobsApi.getJobs(filters),
    refetchInterval: 5000,
  });
}

export function useJobDetails(jobId: string | null) {
  return useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => jobsApi.getJobById(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Refetch faster if job is still active
      const status = query.state.data?.data?.status;
      if (status === 'ENQUEUED' || status === 'RUNNING' || status === 'RETRY_WAITING') {
        return 2000;
      }
      return false; // Don't refetch if completed/failed/dead
    },
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.retryJob,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.cancelJob,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

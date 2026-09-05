import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { parsePrometheusMetrics } from '../lib/metrics-parser';
import { DashboardMetrics, PerformanceSample } from '../types/dashboard';

export function useDashboardData() {
  const [history, setHistory] = useState<PerformanceSample[]>([]);
  const [lastTotalCompleted, setLastTotalCompleted] = useState<number | null>(null);

  // 1. Fetch Metrics
  const { data: metrics, isLoading: isMetricsLoading, isError: isMetricsError } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const response = await apiClient.get('/health/metrics', { responseType: 'text' });
      return parsePrometheusMetrics(response.data);
    },
    refetchInterval: 5000,
    staleTime: 4000,
  });

  // 2. Fetch Queues
  const { data: queuesConfig, isLoading: isQueuesLoading } = useQuery({
    queryKey: ['dashboard-queues'],
    queryFn: async () => {
      // Assuming projectId is "default" for now, or fetch the user's project
      const response = await apiClient.get('/queues', { params: { projectId: 'default' } });
      return response.data;
    },
    refetchInterval: 10000,
  });

  // 3. Fetch Recent Jobs
  const { data: recentJobs, isLoading: isJobsLoading } = useQuery({
    queryKey: ['dashboard-jobs'],
    queryFn: async () => {
      const response = await apiClient.get('/jobs', { params: { limit: 10, sort: 'desc' } });
      return response.data;
    },
    refetchInterval: 3000,
  });

  // Update history and jobs per second
  useEffect(() => {
    if (!metrics) return;

    // We can't strictly calculate jobs/sec without a strictly monotonic total count in parsed metrics,
    // but we can estimate based on delta of total finished jobs if we added that to parsed metrics.
    // For now, let's keep it simple.
    
    // Create new sample
    const newSample: PerformanceSample = {
      timestamp: Date.now(),
      jobsPerSecond: metrics.system.jobsPerSecond || 0, // In reality, calculate this delta
      queueDepth: metrics.system.queueDepth,
      avgExecutionLatencyMs: metrics.system.avgExecutionTimeMs,
    };

    setHistory((prev) => {
      const updated = [...prev, newSample];
      // Keep only last 60 samples (5 mins at 5s interval)
      if (updated.length > 60) {
        return updated.slice(updated.length - 60);
      }
      return updated;
    });
  }, [metrics]);

  return {
    metrics,
    queuesConfig,
    recentJobs,
    history,
    isLoading: isMetricsLoading || isQueuesLoading || isJobsLoading,
    isError: isMetricsError, // Graceful degradation handled by components if metrics is null
  };
}

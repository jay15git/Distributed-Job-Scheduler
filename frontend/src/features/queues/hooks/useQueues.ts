import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queuesApi } from '../api/queues-api';

export function useQueues() {
  return useQuery({
    queryKey: ['queues'],
    queryFn: queuesApi.getQueues,
    refetchInterval: 5000,
  });
}

export function useQueueDetails(name: string | null) {
  return useQuery({
    queryKey: ['queues', name],
    queryFn: () => queuesApi.getQueueByName(name!),
    enabled: !!name,
    refetchInterval: 5000,
  });
}

export function usePauseQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: queuesApi.pauseQueue,
    onMutate: async (queueName) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['queues'] });
      const previousQueues = queryClient.getQueryData(['queues']);
      
      queryClient.setQueryData(['queues'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((q: any) => 
            q.name === queueName ? { ...q, isPaused: true } : q
          )
        };
      });
      return { previousQueues };
    },
    onError: (err, queueName, context) => {
      if (context?.previousQueues) {
        queryClient.setQueryData(['queues'], context.previousQueues);
      }
    },
    onSettled: (data, error, queueName) => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queues', queueName] });
    },
  });
}

export function useResumeQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: queuesApi.resumeQueue,
    onMutate: async (queueName) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['queues'] });
      const previousQueues = queryClient.getQueryData(['queues']);
      
      queryClient.setQueryData(['queues'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((q: any) => 
            q.name === queueName ? { ...q, isPaused: false } : q
          )
        };
      });
      return { previousQueues };
    },
    onError: (err, queueName, context) => {
      if (context?.previousQueues) {
        queryClient.setQueryData(['queues'], context.previousQueues);
      }
    },
    onSettled: (data, error, queueName) => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queues', queueName] });
    },
  });
}

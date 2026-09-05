'use client';

import { QueueList } from '@/features/queues/components/QueueList';
import { QueueSummaryCards } from '@/features/queues/components/QueueSummaryCards';
import { useQueues } from '@/features/queues/hooks/useQueues';

export default function QueuesPage() {
  const { data } = useQueues();
  const queues = data?.data || [];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Queue Management</h1>
          <p className="text-muted-foreground mt-1">Monitor queue health, pause processing, and inspect throughput.</p>
        </div>
      </div>

      <QueueSummaryCards queues={queues} />
      
      <QueueList />
    </div>
  );
}

'use client';

import { WorkerList } from '@/features/workers/components/WorkerList';
import { WorkerSummaryCards } from '@/features/workers/components/WorkerSummaryCards';
import { useWorkers } from '@/features/workers/hooks/useWorkers';

export default function WorkersPage() {
  const { data } = useWorkers();
  const workers = data?.data || [];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Worker Nodes</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor the distributed compute cluster.</p>
        </div>
      </div>

      <WorkerSummaryCards workers={workers} />
      
      <WorkerList />
    </div>
  );
}

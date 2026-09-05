'use client';

import React from 'react';
import { getWorkerStatus } from '@/components/ui/WorkerStatusBadge';
import { Server, Activity, CheckCircle, Clock } from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';

interface WorkerSummaryCardsProps {
  workers: any[];
}

export function WorkerSummaryCards({ workers }: WorkerSummaryCardsProps) {
  let online = 0;
  let offline = 0;
  let busy = 0;
  let idle = 0;

  workers.forEach(worker => {
    const status = getWorkerStatus(worker.lastHeartbeatAt || worker.updatedAt);
    if (status === 'ONLINE' || status === 'STALE') {
      online++;
      if (worker.currentJobs > 0) {
        busy++;
      } else {
        idle++;
      }
    } else {
      offline++;
    }
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard title="Online Workers" value={online} icon={Server} iconColorClass="text-success" />
      <MetricCard title="Offline" value={offline} icon={Activity} iconColorClass="text-destructive" />
      <MetricCard title="Busy" value={busy} icon={Clock} iconColorClass="text-warning" />
      <MetricCard title="Idle" value={idle} icon={CheckCircle} iconColorClass="text-info" />
    </div>
  );
}

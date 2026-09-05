'use client';

import React from 'react';
import { Layers, PlayCircle, PauseCircle, Clock, Activity } from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';

interface QueueSummaryCardsProps {
  queues: any[];
}

export function QueueSummaryCards({ queues }: QueueSummaryCardsProps) {
  const total = queues.length;
  const active = queues.filter(q => !q.isPaused).length;
  const paused = total - active;
  
  const waiting = queues.reduce((acc, q) => acc + (q.metrics?.waiting || 0), 0);
  const running = queues.reduce((acc, q) => acc + (q.metrics?.running || 0), 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <MetricCard title="Total Queues" value={total} icon={Layers} iconColorClass="text-primary" />
      <MetricCard title="Active" value={active} icon={PlayCircle} iconColorClass="text-success" />
      <MetricCard title="Paused" value={paused} icon={PauseCircle} iconColorClass="text-warning" />
      <MetricCard title="Waiting Jobs" value={waiting} icon={Clock} iconColorClass="text-info" />
      <MetricCard title="Running Jobs" value={running} icon={Activity} iconColorClass="text-primary" />
    </div>
  );
}

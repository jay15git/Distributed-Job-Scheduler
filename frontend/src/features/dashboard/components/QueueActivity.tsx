'use client';

import { QueueMetric } from '../types/dashboard';
import { Layers, ArrowUpRight, AlertTriangle } from 'lucide-react';

interface QueueActivityProps {
  queuesConfig: any[];
  metricsQueues: QueueMetric[];
  isError: boolean;
}

export function QueueActivity({ queuesConfig, metricsQueues, isError }: QueueActivityProps) {
  if (isError) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Queue Activity</h3>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Queue activity unavailable
        </div>
      </div>
    );
  }

  // Merge static config with real-time metrics
  const queues = queuesConfig?.map(config => {
    const metric = metricsQueues.find(m => m.queueName === config.name) || {
      waitingJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      successRate: 100,
      drainRatePerSec: 0,
    };
    return {
      ...config,
      ...metric,
    };
  }) || [];

  if (queues.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Queue Activity</h3>
        <div className="text-sm text-muted-foreground">No queues configured.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm flex flex-col h-full">
      <div className="p-6 pb-2">
        <h3 className="text-lg font-semibold tracking-tight">Queue Activity</h3>
        <p className="text-sm text-muted-foreground">Throughput and capacity by queue</p>
      </div>
      <div className="p-6 pt-4 flex-1 overflow-auto">
        <div className="space-y-4">
          {queues.map((queue) => {
            const total = queue.waitingJobs + queue.runningJobs + queue.failedJobs;
            const waitingPercent = total > 0 ? (queue.waitingJobs / total) * 100 : 0;
            const runningPercent = total > 0 ? (queue.runningJobs / total) * 100 : 0;

            return (
              <div key={queue.id} className="space-y-2 p-3 rounded-lg border border-border/50 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Layers className="h-4 w-4 text-primary" />
                    {queue.name}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowUpRight className="h-3 w-3 text-success" />
                    {queue.drainRatePerSec.toFixed(1)}/s drain
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{queue.waitingJobs} waiting</span>
                  <span>{queue.runningJobs} running</span>
                </div>
                
                <div className="h-2 w-full rounded-full bg-border overflow-hidden flex">
                  <div className="h-full bg-primary/40 transition-all duration-300" style={{ width: `${waitingPercent}%` }} />
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${runningPercent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

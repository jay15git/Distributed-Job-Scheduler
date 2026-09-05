'use client';

import { WorkerMetric } from '../types/dashboard';
import { Server, Activity, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface WorkerStatusProps {
  workers: WorkerMetric[];
  isError: boolean;
}

export function WorkerStatus({ workers, isError }: WorkerStatusProps) {
  if (isError) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Worker Status</h3>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-warning" />
          Worker status unavailable
        </div>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Worker Status</h3>
        <div className="text-sm text-muted-foreground">No active workers found.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm flex flex-col h-full">
      <div className="p-6 pb-2">
        <h3 className="text-lg font-semibold tracking-tight">Worker Status</h3>
        <p className="text-sm text-muted-foreground">Real-time health of consumer instances</p>
      </div>
      <div className="p-6 pt-4 flex-1 overflow-auto">
        <div className="space-y-4">
          {workers.map((worker) => (
            <div key={worker.workerId} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Server className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {worker.workerId}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      worker.status === 'Online' ? 'bg-success/15 text-success' :
                      worker.status === 'Stale' ? 'bg-warning/15 text-warning' :
                      'bg-destructive/15 text-destructive'
                    }`}>
                      {worker.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> 
                      {worker.lastHeartbeat.getTime() === 0 ? 'Never' : formatDistanceToNow(worker.lastHeartbeat, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{worker.activeJobs}</div>
                <div className="text-xs text-muted-foreground">active jobs</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

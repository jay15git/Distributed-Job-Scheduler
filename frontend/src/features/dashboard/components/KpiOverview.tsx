'use client';

import { Activity, CheckCircle2, Clock, ListTree, Server, XCircle, AlertTriangle } from 'lucide-react';
import { SystemMetric } from '../types/dashboard';

interface KpiOverviewProps {
  system?: SystemMetric;
  isError: boolean;
}

export function KpiOverview({ system, isError }: KpiOverviewProps) {
  if (isError || !system) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 opacity-50">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="tracking-tight text-sm font-medium">Unavailable</h3>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-muted-foreground">-</div>
          </div>
        ))}
      </div>
    );
  }

  const kpis = [
    { label: 'Active Workers', value: system.activeWorkers, icon: Server, color: 'text-info' },
    { label: 'Queue Depth', value: system.queueDepth, icon: Layers, color: 'text-primary' },
    { label: 'Running Jobs', value: system.runningJobs, icon: Activity, color: 'text-info' },
    { label: 'Success Rate', value: `${system.successRate.toFixed(1)}%`, icon: CheckCircle2, color: 'text-success' },
    { label: 'Failed Jobs', value: system.failedJobs, icon: XCircle, color: 'text-warning' },
    { label: 'DLQ Depth', value: system.dlqDepth, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Avg Latency', value: `${system.avgExecutionTimeMs.toFixed(0)}ms`, icon: Clock, color: 'text-muted-foreground' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {kpis.map((kpi, idx) => (
        <div key={idx} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{kpi.label}</h3>
            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
          </div>
          <div className="text-2xl font-bold">{kpi.value}</div>
        </div>
      ))}
    </div>
  );
}

// Ensure Layers is imported since we used it
import { Layers } from 'lucide-react';

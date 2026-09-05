'use client';

import React from 'react';

type WorkerStatus = 'ONLINE' | 'STALE' | 'OFFLINE';

interface WorkerStatusBadgeProps {
  lastHeartbeat: Date | string | number;
  className?: string;
}

export function getWorkerStatus(lastHeartbeat: Date | string | number): WorkerStatus {
  const diffInSeconds = (Date.now() - new Date(lastHeartbeat).getTime()) / 1000;
  
  if (diffInSeconds < 15) return 'ONLINE';
  if (diffInSeconds < 30) return 'STALE';
  return 'OFFLINE';
}

const statusConfig: Record<WorkerStatus, { bg: string, text: string, label: string, dot: string }> = {
  ONLINE: { bg: 'bg-success/15', text: 'text-success', label: 'Online', dot: 'bg-success' },
  STALE: { bg: 'bg-warning/15', text: 'text-warning', label: 'Stale', dot: 'bg-warning' },
  OFFLINE: { bg: 'bg-destructive/15', text: 'text-destructive', label: 'Offline', dot: 'bg-destructive' },
};

export function WorkerStatusBadge({ lastHeartbeat, className = '' }: WorkerStatusBadgeProps) {
  const status = getWorkerStatus(lastHeartbeat);
  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

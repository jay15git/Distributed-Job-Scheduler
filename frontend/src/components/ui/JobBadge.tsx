'use client';

import React from 'react';

type JobStatus = 'COMPLETED' | 'RUNNING' | 'ENQUEUED' | 'DELAYED' | 'RETRY_WAITING' | 'FAILED' | 'DEAD';

interface JobBadgeProps {
  status: JobStatus | string;
  className?: string;
}

const statusConfig: Record<string, { bg: string, text: string, label: string }> = {
  COMPLETED: { bg: 'bg-success/15', text: 'text-success', label: 'Completed' },
  RUNNING: { bg: 'bg-info/15', text: 'text-info', label: 'Running' },
  ENQUEUED: { bg: 'bg-primary/15', text: 'text-primary', label: 'Enqueued' },
  DELAYED: { bg: 'bg-warning/15', text: 'text-warning', label: 'Delayed' },
  RETRY_WAITING: { bg: 'bg-warning/15', text: 'text-warning', label: 'Retrying' },
  FAILED: { bg: 'bg-destructive/15', text: 'text-destructive', label: 'Failed' },
  DEAD: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'DLQ' },
};

export function JobBadge({ status, className = '' }: JobBadgeProps) {
  const config = statusConfig[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };

  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.bg} ${config.text} ${className}`}>
      {config.label}
    </span>
  );
}

'use client';

import React from 'react';

interface QueueStatusBadgeProps {
  isPaused: boolean;
  className?: string;
}

export function QueueStatusBadge({ isPaused, className = '' }: QueueStatusBadgeProps) {
  const config = isPaused
    ? { bg: 'bg-warning/15', text: 'text-warning', label: 'Paused', dot: 'bg-warning' }
    : { bg: 'bg-success/15', text: 'text-success', label: 'Active', dot: 'bg-success' };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

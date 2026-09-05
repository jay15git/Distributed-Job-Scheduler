'use client';

import React from 'react';
import { CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

interface QueueHealthBadgeProps {
  waiting: number;
  failureRate: number; // 0 to 1
  className?: string;
}

export function getQueueHealth(waiting: number, failureRate: number): 'Healthy' | 'Warning' | 'Critical' {
  // Simple heuristic
  if (failureRate > 0.1 || waiting > 1000) return 'Critical';
  if (failureRate > 0.02 || waiting > 100) return 'Warning';
  return 'Healthy';
}

export function QueueHealthBadge({ waiting, failureRate, className = '' }: QueueHealthBadgeProps) {
  const health = getQueueHealth(waiting, failureRate);
  
  if (health === 'Critical') {
    return (
      <span className={`inline-flex items-center gap-1 text-destructive ${className}`}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm font-medium">Critical</span>
      </span>
    );
  }
  
  if (health === 'Warning') {
    return (
      <span className={`inline-flex items-center gap-1 text-warning ${className}`}>
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">Warning</span>
      </span>
    );
  }
  
  return (
    <span className={`inline-flex items-center gap-1 text-success ${className}`}>
      <CheckCircle className="h-4 w-4" />
      <span className="text-sm font-medium">Healthy</span>
    </span>
  );
}

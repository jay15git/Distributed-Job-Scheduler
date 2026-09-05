'use client';

import React from 'react';

interface UtilizationBarProps {
  current: number;
  max: number;
  className?: string;
}

export function UtilizationBar({ current, max, className = '' }: UtilizationBarProps) {
  const percentage = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0;
  
  let colorClass = 'bg-success';
  if (percentage >= 90) {
    colorClass = 'bg-destructive';
  } else if (percentage >= 70) {
    colorClass = 'bg-warning';
  } else if (percentage > 0) {
    colorClass = 'bg-info';
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground font-medium">{current} / {max}</span>
        <span className="font-mono text-muted-foreground">{percentage}%</span>
      </div>
      <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
        <div 
          className={`h-full ${colorClass} transition-all duration-500`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

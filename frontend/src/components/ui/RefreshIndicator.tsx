'use client';

import React from 'react';

interface RefreshIndicatorProps {
  intervalSeconds: number;
}

export function RefreshIndicator({ intervalSeconds }: RefreshIndicatorProps) {
  return (
    <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-muted/30 rounded-md text-xs font-medium text-muted-foreground border border-border/30">
      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
      Live • Refreshing every {intervalSeconds}s
    </div>
  );
}

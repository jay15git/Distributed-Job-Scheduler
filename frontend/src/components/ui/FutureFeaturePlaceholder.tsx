'use client';

import React from 'react';
import { Construction } from 'lucide-react';

interface FutureFeaturePlaceholderProps {
  title: string;
  description: string;
  backendVersion: string;
}

export function FutureFeaturePlaceholder({ title, description, backendVersion }: FutureFeaturePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
      <div className="h-16 w-16 rounded-full bg-warning/20 flex items-center justify-center mb-6 text-warning">
        <Construction className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        {description}
      </p>
      
      <div className="inline-flex flex-col items-center p-4 bg-card border border-border/50 rounded-lg shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Current Backend Version
        </span>
        <span className="font-mono text-sm text-primary">
          {backendVersion}
        </span>
      </div>
    </div>
  );
}

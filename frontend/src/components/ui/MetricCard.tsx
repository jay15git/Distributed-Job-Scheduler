'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  iconColorClass?: string;
}

export function MetricCard({ title, value, icon: Icon, iconColorClass = 'text-primary' }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{title}</h3>
        {Icon && <Icon className={`h-4 w-4 ${iconColorClass}`} />}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

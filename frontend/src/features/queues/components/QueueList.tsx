'use client';

import React, { useState } from 'react';
import { useQueues } from '../hooks/useQueues';
import { QueueStatusBadge } from './QueueStatusBadge';
import { QueueHealthBadge } from './QueueHealthBadge';
import dynamic from 'next/dynamic';
import { RefreshCw, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { RefreshIndicator } from '@/components/ui/RefreshIndicator';

const QueueDetailsDrawer = dynamic(() => import('./QueueDetailsDrawer').then(mod => mod.QueueDetailsDrawer), { ssr: false });

export function QueueList() {
  const [selectedQueue, setSelectedQueue] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError } = useQueues();

  let queues = Array.isArray(data) ? data : (data?.data || []);

  if (searchTerm) {
    queues = queues.filter((q: any) => 
      q.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Calculate some derived stats for the table
  const getSuccessRate = (queue: any) => {
    const completed = queue.metrics?.completed || 0;
    const failed = queue.metrics?.failed || 0;
    const total = completed + failed;
    if (total === 0) return '-';
    return `${Math.round((completed / total) * 100)}%`;
  };

  const getFailureRateNum = (queue: any) => {
    const completed = queue.metrics?.completed || 0;
    const failed = queue.metrics?.failed || 0;
    const total = completed + failed;
    if (total === 0) return 0;
    return failed / total;
  };

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-card border border-border/50 rounded-xl shadow-sm">
        <div className="flex flex-1 items-center gap-4 w-full">
          <div className="flex items-center gap-2 max-w-md w-full relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search queues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-muted/50 border border-border/50 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          
          <RefreshIndicator intervalSeconds={5} />
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border/50">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">Queue</th>
                <th scope="col" className="px-6 py-4 font-medium">Status</th>
                <th scope="col" className="px-6 py-4 font-medium">Waiting</th>
                <th scope="col" className="px-6 py-4 font-medium">Running</th>
                <th scope="col" className="px-6 py-4 font-medium">Success Rate</th>
                <th scope="col" className="px-6 py-4 font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-0 border-0">
                    <TableSkeleton columns={6} rows={4} />
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-destructive">
                    Failed to load queues.
                  </td>
                </tr>
              ) : queues.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState 
                      icon={Search}
                      title="No queues found"
                      description="No queues matched the current filters."
                    />
                  </td>
                </tr>
              ) : (
                queues.map((queue: any) => (
                  <tr 
                    key={queue.name} 
                    onClick={() => setSelectedQueue(queue)}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-medium font-mono text-sm group-hover:text-primary transition-colors">
                      {queue.name}
                    </td>
                    <td className="px-6 py-4">
                      <QueueStatusBadge isPaused={queue.isPaused} />
                    </td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">
                      {queue.metrics?.waiting || 0}
                    </td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">
                      {queue.metrics?.running || 0}
                    </td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">
                      {getSuccessRate(queue)}
                    </td>
                    <td className="px-6 py-4">
                      <QueueHealthBadge 
                        waiting={queue.metrics?.waiting || 0}
                        failureRate={getFailureRateNum(queue)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <QueueDetailsDrawer 
        queue={selectedQueue} 
        onClose={() => setSelectedQueue(null)} 
      />
    </div>
  );
}

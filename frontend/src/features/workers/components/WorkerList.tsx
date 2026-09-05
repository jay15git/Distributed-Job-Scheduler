'use client';

import React, { useState } from 'react';
import { useWorkers } from '../hooks/useWorkers';
import { WorkerStatusBadge, getWorkerStatus } from '@/components/ui/WorkerStatusBadge';
import { UtilizationBar } from '@/components/ui/UtilizationBar';
import dynamic from 'next/dynamic';
import { RefreshCw, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshIndicator } from '@/components/ui/RefreshIndicator';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';

const WorkerDetailsDrawer = dynamic(() => import('./WorkerDetailsDrawer').then(mod => mod.WorkerDetailsDrawer), { ssr: false });

export function WorkerList() {
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError } = useWorkers();

  let workers = Array.isArray(data) ? data : (data?.data || []);

  // Sort workers: Online first, then Highest Utilization, then Most recent heartbeat
  workers = [...workers].sort((a, b) => {
    const statusA = getWorkerStatus(a.lastHeartbeatAt || a.updatedAt);
    const statusB = getWorkerStatus(b.lastHeartbeatAt || b.updatedAt);
    
    // 1. Online First
    const statusScore = { 'ONLINE': 0, 'STALE': 1, 'OFFLINE': 2 };
    if (statusScore[statusA] !== statusScore[statusB]) {
      return statusScore[statusA] - statusScore[statusB];
    }
    
    // 2. Highest utilization (currentJobs / maxConcurrency)
    const utilA = a.maxConcurrency ? a.currentJobs / a.maxConcurrency : 0;
    const utilB = b.maxConcurrency ? b.currentJobs / b.maxConcurrency : 0;
    if (utilB !== utilA) {
      return utilB - utilA;
    }

    // 3. Most recent heartbeat
    const heartA = new Date(a.lastHeartbeatAt || a.updatedAt).getTime();
    const heartB = new Date(b.lastHeartbeatAt || b.updatedAt).getTime();
    return heartB - heartA;
  });

  if (searchTerm) {
    workers = workers.filter((w: any) => 
      w.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (w.name && w.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-card border border-border/50 rounded-xl shadow-sm">
        <div className="flex flex-1 items-center gap-4 w-full">
          <div className="flex items-center gap-2 max-w-md w-full relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by Worker ID..."
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
                <th scope="col" className="px-6 py-4 font-medium">Worker ID</th>
                <th scope="col" className="px-6 py-4 font-medium">Status</th>
                <th scope="col" className="px-6 py-4 font-medium min-w-[150px]">Utilization</th>
                <th scope="col" className="px-6 py-4 font-medium">Queues</th>
                <th scope="col" className="px-6 py-4 font-medium">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-0 border-0">
                    <TableSkeleton columns={5} rows={4} />
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-destructive">
                    Failed to load workers.
                  </td>
                </tr>
              ) : workers.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState 
                      icon={Search}
                      title="No workers found"
                      description="There are no registered worker nodes in the cluster."
                    />
                  </td>
                </tr>
              ) : (
                workers.map((worker: any) => (
                  <tr 
                    key={worker.id} 
                    onClick={() => setSelectedWorker(worker)}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-medium font-mono text-xs group-hover:text-primary transition-colors">
                      {worker.name || worker.id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      <WorkerStatusBadge lastHeartbeat={worker.lastHeartbeatAt || worker.updatedAt} />
                    </td>
                    <td className="px-6 py-4">
                      <UtilizationBar 
                        current={worker.currentJobs || 0} 
                        max={worker.maxConcurrency || 10} 
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {worker.queues && worker.queues.length > 0 ? (
                          worker.queues.slice(0, 2).map((q: string) => (
                            <span key={q} className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                              {q}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">default</span>
                        )}
                        {worker.queues && worker.queues.length > 2 && (
                          <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
                            +{worker.queues.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {worker.lastHeartbeatAt ? formatDistanceToNow(new Date(worker.lastHeartbeatAt), { addSuffix: true }) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <WorkerDetailsDrawer 
        worker={selectedWorker} 
        onClose={() => setSelectedWorker(null)} 
      />
    </div>
  );
}

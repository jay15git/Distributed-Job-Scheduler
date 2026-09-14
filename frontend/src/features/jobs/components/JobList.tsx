'use client';

import React, { useState } from 'react';
import { useJobs } from '../hooks/useJobs';
import { jobsApi } from '../api/jobs-api';
import { JobBadge } from '@/components/ui/JobBadge';
import dynamic from 'next/dynamic';
const JobDetailsDrawer = dynamic(() => import('./JobDetailsDrawer').then(mod => mod.JobDetailsDrawer), { ssr: false });
const CreateJobDrawer = dynamic(() => import('./CreateJobDrawer').then(mod => mod.CreateJobDrawer), { ssr: false });
import { RefreshCw, Search, Filter, Server, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { RefreshIndicator } from '@/components/ui/RefreshIndicator';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';

export function JobList() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  
  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [queueFilter, setQueueFilter] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isError } = useJobs({
    page,
    limit,
    status: statusFilter || undefined,
    queue: queueFilter || undefined,
    sort: 'desc',
  });

  const jobs = Array.isArray(data) ? data : (data?.data || []);
  const meta = data?.meta || { total: jobs.length, page: 1, limit: 20, totalPages: 1 };
  
  const hasActiveFilters = statusFilter !== '' || queueFilter !== '';

  const clearFilters = () => {
    setStatusFilter('');
    setQueueFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Top Bar: Filters & Refresh Indicator */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-card border border-border/50 rounded-xl shadow-sm">
        <div className="flex flex-1 items-center gap-4 w-full">
          <div className="flex items-center gap-2 max-w-md w-full relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Job ID (Mock UI)..."
              className="w-full bg-muted/50 border border-border/50 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          
          <RefreshIndicator intervalSeconds={5} />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setIsCreateJobOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors shadow-sm whitespace-nowrap"
          >
            + Create Job
          </button>
          
          <div className="flex items-center gap-2 bg-muted/50 border border-border/50 rounded-md px-3 py-2 whitespace-nowrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-transparent text-sm focus:outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="QUEUED">Queued</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="BLOCKED">Blocked</option>
              <option value="RUNNING">Running</option>
              <option value="RETRY_WAITING">Retry Waiting</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="DLQ">Dead Letter Queue</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2 bg-muted/50 border border-border/50 rounded-md px-3 py-2">
            <LayersIcon className="h-4 w-4 text-muted-foreground" />
            <select
              value={queueFilter}
              onChange={(e) => { setQueueFilter(e.target.value); setPage(1); }}
              className="bg-transparent text-sm focus:outline-none cursor-pointer"
            >
              <option value="">All Queues</option>
              <option value="default">default</option>
              <option value="high-priority">high-priority</option>
              <option value="emails">emails</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border/50">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">Job Name / ID</th>
                <th scope="col" className="px-6 py-4 font-medium">Task Type</th>
                <th scope="col" className="px-6 py-4 font-medium">Queue</th>
                <th scope="col" className="px-6 py-4 font-medium">Status</th>
                <th scope="col" className="px-6 py-4 font-medium">Created</th>
                <th scope="col" className="px-6 py-4 font-medium">Worker</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-0 border-0">
                    <TableSkeleton columns={5} rows={5} />
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-destructive">
                    Failed to load jobs.
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12">
                    <EmptyState 
                      icon={Search}
                      title="No jobs found"
                      description="No jobs matched the current filters. Try adjusting your search or filter criteria."
                      actionLabel={hasActiveFilters ? "Clear Filters" : undefined}
                      onAction={hasActiveFilters ? clearFilters : undefined}
                    />
                  </td>
                </tr>
              ) : (
                jobs.map((job: any) => {
                  const taskType = job.payload?.taskType || 'N/A';
                  return (
                  <tr 
                    key={job.id} 
                    onClick={() => setSelectedJobId(job.id)}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{job.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5 group-hover:text-primary transition-colors">
                        {job.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border/50">
                        {taskType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {job.queueName}
                    </td>
                    <td className="px-6 py-4">
                      <JobBadge status={job.status} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      <span className="block">{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {job.lockedBy ? (
                        <span className="flex items-center gap-1"><Server className="h-3 w-3" /> {job.lockedBy}</span>
                      ) : '-'}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          
          {/* Removed duplicate empty state here */}
        </div>
        
        {/* Pagination */}
        {jobs.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border/50 bg-muted/10">
            <div className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, meta.total)} of {meta.total} jobs
            </div>
            <div className="flex items-center gap-2">
              <button 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 text-xs font-medium border border-border/50 rounded-md bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button 
                disabled={page >= meta.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 text-xs font-medium border border-border/50 rounded-md bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <JobDetailsDrawer 
        jobId={selectedJobId} 
        onClose={() => setSelectedJobId(null)} 
      />
      
      <CreateJobDrawer
        isOpen={isCreateJobOpen}
        onClose={() => setIsCreateJobOpen(false)}
        onSuccess={() => {
          setPage(1);
          setQueueFilter('');
          setStatusFilter('');
        }}
      />
    </div>
  );
}

// Ensure icon is defined since I used it
import { Layers as LayersIcon } from 'lucide-react';

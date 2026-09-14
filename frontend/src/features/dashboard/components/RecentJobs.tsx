'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RecentJobsProps {
  jobs: any[];
  isError: boolean;
}

const statusColors: Record<string, string> = {
  COMPLETED: 'bg-success/15 text-success',
  FAILED: 'bg-destructive/15 text-destructive',
  RUNNING: 'bg-info/15 text-info',
  QUEUED: 'bg-primary/15 text-primary',
  SCHEDULED: 'bg-warning/15 text-warning',
  DLQ: 'bg-destructive/15 text-destructive',
};

export function RecentJobs({ jobs, isError }: RecentJobsProps) {
  if (isError) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Recent Jobs</h3>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Job data unavailable
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm flex flex-col">
      <div className="p-6 pb-4">
        <h3 className="text-lg font-semibold tracking-tight">Recent Jobs</h3>
        <p className="text-sm text-muted-foreground">Latest execution history across all queues</p>
      </div>
      <div className="px-6 pb-6 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/20">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium rounded-l-lg">Job ID</th>
              <th scope="col" className="px-4 py-3 font-medium">Queue</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Duration</th>
              <th scope="col" className="px-4 py-3 font-medium rounded-r-lg">Finished</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No recent jobs found.
                </td>
              </tr>
            ) : (
              jobs?.slice(0, 5).map((job) => (
                <tr key={job.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-medium font-mono text-xs">{job.id.substring(0, 8)}...</td>
                  <td className="px-4 py-3">{job.queueName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[job.status] || 'bg-muted text-muted-foreground'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {job.startedAt && job.finishedAt ? 
                      `${Math.max(1, new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime())}ms` : 
                      '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {job.finishedAt ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(job.finishedAt), { addSuffix: true })}
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

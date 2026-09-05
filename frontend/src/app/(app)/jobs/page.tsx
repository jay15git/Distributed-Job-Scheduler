'use client';

import { JobList } from '@/features/jobs/components/JobList';

export default function JobsPage() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Management</h1>
          <p className="text-muted-foreground mt-1">Investigate, retry, or cancel specific job executions.</p>
        </div>
      </div>

      <JobList />
    </div>
  );
}

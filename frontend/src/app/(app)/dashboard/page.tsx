'use client';

import { useDashboardData } from '@/features/dashboard/hooks/useDashboardData';
import { KpiOverview } from '@/features/dashboard/components/KpiOverview';
import { QueueActivity } from '@/features/dashboard/components/QueueActivity';
import { WorkerStatus } from '@/features/dashboard/components/WorkerStatus';
import { RecentJobs } from '@/features/dashboard/components/RecentJobs';
import { ActivityFeed } from '@/features/dashboard/components/ActivityFeed';
import { RefreshCw } from 'lucide-react';
import { CardSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import dynamic from 'next/dynamic';

const PerformanceTimeline = dynamic(
  () => import('@/features/dashboard/components/PerformanceTimeline').then(mod => mod.PerformanceTimeline),
  { ssr: false, loading: () => <div className="h-[300px] bg-card border border-border/50 rounded-xl p-5 animate-pulse" /> }
);

export default function DashboardPage() {
  const { metrics, queuesConfig, recentJobs, history, isLoading, isError } = useDashboardData();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time system health and activity.</p>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Syncing...
          </div>
        )}
      </div>

      {/* Section 1 - System Overview */}
      {isLoading && !metrics ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[...Array(7)].map((_, i) => (
             <div key={i} className="h-[90px] rounded-xl border border-border/50 bg-card p-4 shadow-sm animate-pulse">
               <div className="h-4 w-1/2 bg-muted rounded mb-4" />
               <div className="h-6 w-1/3 bg-muted rounded" />
             </div>
          ))}
        </div>
      ) : (
        <KpiOverview system={metrics?.system} isError={isError} />
      )}

      {/* Main Grid Layout */}
      <div className="grid gap-6 lg:grid-cols-3 xl:grid-cols-4">
        
        {/* Left Column (Wider) */}
        <div className="flex flex-col gap-6 lg:col-span-2 xl:col-span-3">
          
          {/* Section 2 - Queue Activity & Section 3 - Worker Status */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="h-[300px]">
              {isLoading && !metrics ? (
                <CardSkeleton />
              ) : (
                <QueueActivity 
                  queuesConfig={queuesConfig?.data || []} 
                  metricsQueues={metrics?.queues || []} 
                  isError={false} // Only fails if queues fetch fails
                />
              )}
            </div>
            <div className="h-[300px]">
              {isLoading && !metrics ? (
                <CardSkeleton />
              ) : (
                <WorkerStatus 
                  workers={metrics?.workers || []} 
                  isError={isError} 
                />
              )}
            </div>
          </div>

          {/* Section 6 - Performance Timeline */}
          <PerformanceTimeline history={history} isError={isError} />

          {/* Section 4 - Recent Jobs */}
          {isLoading && !recentJobs ? (
            <CardSkeleton />
          ) : (
            <RecentJobs jobs={recentJobs?.data || []} isError={false} />
          )}
          
        </div>

        {/* Right Column (Sidebar) */}
        <div className="flex flex-col gap-6 lg:col-span-1 h-[800px] xl:h-auto">
          {/* Section 5 - Activity Feed */}
          {isLoading && !recentJobs ? (
            <CardSkeleton />
          ) : (
            <ActivityFeed recentJobs={recentJobs?.data || []} />
          )}
        </div>
      </div>
    </div>
  );
}

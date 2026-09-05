'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { QueueStatusBadge } from './QueueStatusBadge';
import { QueueHealthBadge } from './QueueHealthBadge';
import { PlayCircle, PauseCircle, Activity, Clock, Server, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useJobs } from '@/features/jobs/hooks/useJobs';
import { JobBadge } from '@/components/ui/JobBadge';
import { useRouter } from 'next/navigation';
import { MetricCard } from '@/components/ui/MetricCard';
import { usePauseQueue, useResumeQueue } from '../hooks/useQueues';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { notify } from '@/lib/notify';
import { useState } from 'react';

interface QueueDetailsDrawerProps {
  queue: any | null;
  onClose: () => void;
}

export function QueueDetailsDrawer({ queue, onClose }: QueueDetailsDrawerProps) {
  const router = useRouter();
  
  const pauseMutation = usePauseQueue();
  const resumeMutation = useResumeQueue();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { data: jobsData } = useJobs({ queue: queue?.name, limit: 10 });
  const recentJobs = jobsData?.data || [];

  if (!queue) return null;

  const handleJobClick = (jobId: string) => {
    onClose();
    router.push(`/jobs?id=${jobId}`);
  };

  const handleConfirmToggle = () => {
    if (queue.isPaused) {
      resumeMutation.mutate(queue.name, {
        onSuccess: () => notify.success(`Queue '${queue.name}' resumed successfully.`),
        onError: () => notify.error(`Failed to resume queue '${queue.name}'.`)
      });
    } else {
      pauseMutation.mutate(queue.name, {
        onSuccess: () => notify.success(`Queue '${queue.name}' paused successfully.`),
        onError: () => notify.error(`Failed to pause queue '${queue.name}'.`)
      });
    }
  };

  return (
    <Sheet open={!!queue} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto custom-scrollbar border-l-border/50 bg-background/95 backdrop-blur-xl">
        <SheetHeader className="mb-6 border-b border-border/50 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl flex items-center gap-2">
                {queue.name}
                <QueueStatusBadge isPaused={queue.isPaused} />
              </SheetTitle>
              <SheetDescription className="font-mono text-xs mt-1">
                Queue Configuration & Metrics
              </SheetDescription>
            </div>
            <button 
              onClick={() => setIsConfirmOpen(true)}
              disabled={pauseMutation.isPending || resumeMutation.isPending}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border flex items-center gap-2 transition-colors disabled:opacity-50 ${
                queue.isPaused 
                  ? 'bg-success/10 text-success border-success/20 hover:bg-success/20' 
                  : 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'
              }`}
            >
              {queue.isPaused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
              {queue.isPaused ? 'Resume Queue' : 'Pause Queue'}
            </button>
          </div>
        </SheetHeader>

        <div className="space-y-8 pb-12">
          
          {/* Metadata Section */}
          <section className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Health</span>
              <p className="font-medium">
                <QueueHealthBadge 
                  waiting={queue.metrics?.waiting || 0} 
                  failureRate={
                    queue.metrics?.completed + queue.metrics?.failed > 0 
                      ? (queue.metrics?.failed || 0) / (queue.metrics?.completed + queue.metrics?.failed) 
                      : 0
                  } 
                />
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Updated</span>
              <p className="font-medium flex items-center gap-1 text-info">
                <Clock className="h-3 w-3" />
                {queue.updatedAt ? formatDistanceToNow(new Date(queue.updatedAt), { addSuffix: true }) : '-'}
              </p>
            </div>
          </section>

          {/* Configuration Cards */}
          <section>
            <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-2 mb-4">Configuration</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted/30 rounded-lg border border-border/30">
                <div className="text-xs text-muted-foreground mb-1">Max Retries</div>
                <div className="font-mono text-lg">{queue.retryPolicy?.maxRetries ?? 3}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border border-border/30">
                <div className="text-xs text-muted-foreground mb-1">Backoff</div>
                <div className="font-mono text-lg">{queue.retryPolicy?.backoffMultiplier ?? 2}x</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border border-border/30">
                <div className="text-xs text-muted-foreground mb-1">Initial Delay</div>
                <div className="font-mono text-lg">{queue.retryPolicy?.initialDelaySeconds ?? 10}s</div>
              </div>
            </div>
          </section>

          {/* Metrics */}
          <section>
            <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-2 mb-4">Metrics</h3>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard title="Waiting" value={queue.metrics?.waiting || 0} icon={Clock} iconColorClass="text-warning" />
              <MetricCard title="Running" value={queue.metrics?.running || 0} icon={Activity} iconColorClass="text-info" />
              <MetricCard title="Completed" value={queue.metrics?.completed || 0} icon={CheckCircle} iconColorClass="text-success" />
              <MetricCard title="Failed" value={queue.metrics?.failed || 0} icon={XCircle} iconColorClass="text-destructive" />
            </div>
          </section>

          {/* Recent Jobs */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <h3 className="text-sm font-semibold tracking-tight">Recent Jobs (Top 10)</h3>
            </div>
            
            <div className="space-y-2">
              {recentJobs.length > 0 ? (
                recentJobs.map((job: any) => (
                  <div 
                    key={job.id}
                    onClick={() => handleJobClick(job.id)}
                    className="p-3 bg-card border border-border/50 rounded-lg hover:border-primary/50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs group-hover:text-primary transition-colors">{job.id}</span>
                      <JobBadge status={job.status} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
                      <span>{job.type}</span>
                      <span>{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground italic p-4 bg-muted/20 rounded-md text-center">
                  No recent jobs found for this queue.
                </div>
              )}
            </div>
          </section>

        </div>
      </SheetContent>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmToggle}
        title={queue.isPaused ? 'Resume Queue' : 'Pause Queue'}
        description={queue.isPaused 
          ? `Are you sure you want to resume queue '${queue.name}'? Workers will begin processing jobs from this queue again.`
          : `Are you sure you want to pause queue '${queue.name}'? This will stop workers from picking up new jobs from this queue.`}
        confirmText={queue.isPaused ? 'Resume' : 'Pause'}
        isDestructive={!queue.isPaused}
      />
    </Sheet>
  );
}

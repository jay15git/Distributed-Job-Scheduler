'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { WorkerStatusBadge } from '@/components/ui/WorkerStatusBadge';
import { UtilizationBar } from '@/components/ui/UtilizationBar';
import { Server, Clock, HardDrive, Cpu, Activity } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useJobs } from '@/features/jobs/hooks/useJobs';
import { JobBadge } from '@/components/ui/JobBadge';
import { useRouter } from 'next/navigation';

interface WorkerDetailsDrawerProps {
  worker: any | null;
  onClose: () => void;
}

export function WorkerDetailsDrawer({ worker, onClose }: WorkerDetailsDrawerProps) {
  const router = useRouter();
  
  // We fetch running jobs globally and filter to this worker. 
  // In a real app, you might have a dedicated endpoint like `/workers/:id/jobs` or filter by `lockedBy` on the jobs API directly.
  const { data: jobsData } = useJobs({ status: 'RUNNING', limit: 50 });
  const runningJobs = jobsData?.data?.filter((j: any) => j.lockedBy === worker?.name || j.lockedBy === worker?.id) || [];

  if (!worker) return null;

  const handleJobClick = (jobId: string) => {
    onClose();
    router.push(`/jobs?id=${jobId}`);
  };

  return (
    <Sheet open={!!worker} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto custom-scrollbar border-l-border/50 bg-background/95 backdrop-blur-xl">
        <SheetHeader className="mb-6 border-b border-border/50 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl flex items-center gap-2">
                Worker Node
                <WorkerStatusBadge lastHeartbeat={worker.lastHeartbeatAt || worker.updatedAt} />
              </SheetTitle>
              <SheetDescription className="font-mono text-xs mt-1">
                {worker.id}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-8 pb-12">
          
          {/* Metadata Section */}
          <section className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Hostname</span>
              <p className="font-medium flex items-center gap-1">
                <Server className="h-3 w-3 text-muted-foreground" />
                {worker.hostname || worker.name || 'Unknown'}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">PID</span>
              <p className="font-mono text-muted-foreground">{worker.pid || '-'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Registered</span>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                {worker.createdAt ? format(new Date(worker.createdAt), 'MMM d, yyyy HH:mm') : '-'}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Last Heartbeat</span>
              <p className="font-medium flex items-center gap-1 text-info">
                <Activity className="h-3 w-3" />
                {worker.lastHeartbeatAt ? formatDistanceToNow(new Date(worker.lastHeartbeatAt), { addSuffix: true }) : '-'}
              </p>
            </div>
          </section>

          {/* Utilization & Capabilities */}
          <section className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-2 mb-4">Resource Utilization</h3>
              <UtilizationBar 
                current={worker.currentJobs || 0} 
                max={worker.maxConcurrency || 10} 
                className="w-full"
              />
            </div>
            
            <div>
              <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-2 mb-4">Supported Queues</h3>
              <div className="flex flex-wrap gap-2">
                {worker.queues && worker.queues.length > 0 ? (
                  worker.queues.map((q: string) => (
                    <span key={q} className="px-2 py-1 bg-muted rounded-md text-xs font-mono text-muted-foreground">
                      {q}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">All queues (default)</span>
                )}
              </div>
            </div>
          </section>

          {/* Running Jobs */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <h3 className="text-sm font-semibold tracking-tight">Currently Processing</h3>
              <span className="px-2 py-0.5 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                {worker.currentJobs || 0} Jobs
              </span>
            </div>
            
            {worker.currentJobs > 0 ? (
              <div className="space-y-2">
                {runningJobs.length > 0 ? (
                  runningJobs.map((job: any) => (
                    <div 
                      key={job.id}
                      onClick={() => handleJobClick(job.id)}
                      className="p-3 bg-card border border-border/50 rounded-lg hover:border-primary/50 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs group-hover:text-primary transition-colors">{job.id}</span>
                        <JobBadge status={job.status} />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                        <span>Queue: <span className="font-medium text-foreground">{job.queueName}</span></span>
                        <span>•</span>
                        <span>Started {formatDistanceToNow(new Date(job.startedAt || job.updatedAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground italic p-4 bg-muted/20 rounded-md text-center">
                    Fetching running jobs from API...
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic p-4 bg-muted/20 rounded-md text-center flex items-center justify-center gap-2">
                <CheckCircle className="h-4 w-4 text-info" />
                Worker is currently idle
              </div>
            )}
          </section>

        </div>
      </SheetContent>
    </Sheet>
  );
}

import { CheckCircle } from 'lucide-react';

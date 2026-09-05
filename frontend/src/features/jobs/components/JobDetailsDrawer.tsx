'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useJobDetails, useRetryJob, useCancelJob } from '../hooks/useJobs';
import { JobBadge } from '@/components/ui/JobBadge';
import { JsonViewer } from './JsonViewer';
import { ExecutionTimeline } from './ExecutionTimeline';
import { RefreshCw, XCircle, Clock, Server, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { notify } from '@/lib/notify';
import { useState } from 'react';

interface JobDetailsDrawerProps {
  jobId: string | null;
  onClose: () => void;
}

export function JobDetailsDrawer({ jobId, onClose }: JobDetailsDrawerProps) {
  const { data, isLoading } = useJobDetails(jobId);
  const { mutate: retryJob, isPending: isRetrying } = useRetryJob();
  const { mutate: cancelJob, isPending: isCanceling } = useCancelJob();

  const [confirmState, setConfirmState] = useState<{ isOpen: boolean, action: 'retry' | 'cancel' | null }>({
    isOpen: false,
    action: null
  });

  const job = data?.data;

  // Build timeline events from the job state if it doesn't have an explicit executions array
  const buildTimeline = () => {
    if (!job) return [];
    const events = [];
    
    events.push({
      id: 'enqueued',
      status: 'ENQUEUED',
      timestamp: job.createdAt,
    });

    if (job.startedAt) {
      events.push({
        id: 'started',
        status: 'RUNNING',
        timestamp: job.startedAt,
      });
    }
    
    // In a real scenario, you'd map over `job.executions` if your backend provides the one-to-many relation.
    // For now, we infer the timeline from the current status and timestamps.
    if (job.failedAt && job.status !== 'COMPLETED') {
      events.push({
        id: 'failed',
        status: 'FAILED',
        timestamp: job.failedAt,
        message: job.error || 'Execution failed',
      });
    }

    if (job.finishedAt && job.status === 'COMPLETED') {
      events.push({
        id: 'completed',
        status: 'COMPLETED',
        timestamp: job.finishedAt,
      });
    }

    if (job.status === 'DEAD') {
      events.push({
        id: 'dead',
        status: 'DEAD',
        timestamp: job.updatedAt,
        message: 'Maximum retries exceeded. Moved to DLQ.',
      });
    }
    
    if (job.status === 'RETRY_WAITING') {
      events.push({
        id: 'retry_waiting',
        status: 'RETRY_WAITING',
        timestamp: job.updatedAt,
      });
    }

    return events;
  };

  const isTerminal = job?.status === 'COMPLETED' || job?.status === 'FAILED' || job?.status === 'DEAD';
  const canRetry = job?.status === 'FAILED' || job?.status === 'DEAD';
  const canCancel = job?.status === 'ENQUEUED' || job?.status === 'DELAYED' || job?.status === 'RETRY_WAITING';

  const handleConfirmAction = () => {
    if (!job) return;
    
    if (confirmState.action === 'retry') {
      retryJob(job.id, {
        onSuccess: () => notify.success(`Job ${job.id.substring(0, 8)} queued for retry.`),
        onError: () => notify.error(`Failed to retry job ${job.id.substring(0, 8)}.`)
      });
    } else if (confirmState.action === 'cancel') {
      cancelJob(job.id, {
        onSuccess: () => notify.success(`Job ${job.id.substring(0, 8)} cancelled.`),
        onError: () => notify.error(`Failed to cancel job ${job.id.substring(0, 8)}.`)
      });
    }
  };

  return (
    <Sheet open={!!jobId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto custom-scrollbar border-l-border/50 bg-background/95 backdrop-blur-xl">
        <SheetHeader className="mb-6 border-b border-border/50 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl flex items-center gap-2">
                {job ? job.name : 'Job Details'}
                {job && <JobBadge status={job.status} />}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs mt-1">
                {jobId}
                {job?.payload?.taskType && (
                  <span className="ml-3 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border/50 font-sans">
                    {job.payload.taskType}
                  </span>
                )}
              </SheetDescription>
            </div>
          </div>

          {job && (
            <div className="flex items-center gap-2 mt-4">
              {canRetry && (
                <button
                  onClick={() => setConfirmState({ isOpen: true, action: 'retry' })}
                  disabled={isRetrying}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  Retry Job
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => setConfirmState({ isOpen: true, action: 'cancel' })}
                  disabled={isCanceling}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-destructive/10 text-destructive rounded-md hover:bg-destructive/20 disabled:opacity-50 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel Job
                </button>
              )}
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading job details...
          </div>
        ) : !job ? (
          <div className="flex items-center justify-center py-12 text-sm text-destructive">
            <AlertTriangle className="h-5 w-5 mr-2" /> Failed to load job details.
          </div>
        ) : (
          <div className="space-y-8 pb-12">
            
            {/* Metadata Section */}
            <section className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Queue</span>
                <p className="font-medium">{job.queueName}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Created</span>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Retries</span>
                <p className="font-medium">{job.retries} / {job.maxRetries}</p>
              </div>
              {job.lockedBy && (
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Worker</span>
                  <p className="font-medium flex items-center gap-1 text-info">
                    <Server className="h-3 w-3" />
                    {job.lockedBy}
                  </p>
                </div>
              )}
            </section>

            {/* Error Details */}
            {job.error && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold tracking-tight text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Error Details
                </h3>
                <div className="bg-destructive/10 text-destructive text-xs font-mono p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
                  {job.error}
                </div>
              </section>
            )}

            {/* Execution Timeline */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-2">Execution Timeline</h3>
              <ExecutionTimeline events={buildTimeline()} />
            </section>

            {/* Payload & Results */}
            <section className="space-y-6">
              <h3 className="text-sm font-semibold tracking-tight border-b border-border/50 pb-2">Data</h3>
              
              <div className="space-y-2">
                <JsonViewer data={job.payload} title="Input Payload" />
              </div>
              
              {job.result && (
                <div className="space-y-2">
                  <JsonViewer data={job.result} title="Execution Result" />
                </div>
              )}
            </section>

          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, action: null })}
        onConfirm={handleConfirmAction}
        title={confirmState.action === 'retry' ? 'Retry Job' : 'Cancel Job'}
        description={confirmState.action === 'retry'
          ? `Are you sure you want to retry job ${jobId}? It will be placed back into the queue.`
          : `Are you sure you want to cancel job ${jobId}? This action cannot be undone.`
        }
        confirmText={confirmState.action === 'retry' ? 'Retry' : 'Cancel Job'}
        isDestructive={confirmState.action === 'cancel'}
      />
    </Sheet>
  );
}

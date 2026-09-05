'use client';

import { useEffect, useState, useRef } from 'react';
import { JobEvent } from '../types/dashboard';
import { CheckCircle2, PlayCircle, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityFeedProps {
  recentJobs: any[];
}

export function ActivityFeed({ recentJobs }: ActivityFeedProps) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const prevJobsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!recentJobs || recentJobs.length === 0) return;

    const newEvents: JobEvent[] = [];
    const currentJobsMap: Record<string, string> = {};

    recentJobs.forEach(job => {
      currentJobsMap[job.id] = job.status;
      
      const prevStatus = prevJobsRef.current[job.id];
      if (prevStatus && prevStatus !== job.status) {
        // Status changed! Create an event
        let message = `Job ${job.id.substring(0, 8)} status changed to ${job.status}`;
        
        if (job.status === 'COMPLETED') message = `Job ${job.id.substring(0, 8)} completed successfully`;
        else if (job.status === 'FAILED') message = `Job ${job.id.substring(0, 8)} failed execution`;
        else if (job.status === 'RUNNING') {
          message = prevStatus === 'RETRY_WAITING' ? `Job ${job.id.substring(0, 8)} retry started` : `Job ${job.id.substring(0, 8)} started running`;
        }
        else if (job.status === 'DEAD') message = `Job ${job.id.substring(0, 8)} moved to DLQ`;

        newEvents.push({
          id: `${job.id}-${job.status}-${Date.now()}`,
          jobId: job.id,
          message,
          status: job.status,
          timestamp: new Date(),
        });
      } else if (!prevStatus && job.status === 'ENQUEUED') {
        // New job enqueued
        newEvents.push({
          id: `${job.id}-ENQUEUED-${Date.now()}`,
          jobId: job.id,
          message: `New job ${job.id.substring(0, 8)} enqueued`,
          status: 'ENQUEUED',
          timestamp: new Date(),
        });
      }
    });

    prevJobsRef.current = { ...prevJobsRef.current, ...currentJobsMap };

    if (newEvents.length > 0) {
      setEvents(prev => {
        const combined = [...newEvents, ...prev];
        return combined.slice(0, 50); // Keep last 50 events
      });
    }
  }, [recentJobs]);

  const getEventIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'FAILED': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'RUNNING': return <PlayCircle className="h-4 w-4 text-info" />;
      case 'DEAD': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'ENQUEUED': return <PlayCircle className="h-4 w-4 text-primary" />;
      case 'RETRY_WAITING': return <RefreshCw className="h-4 w-4 text-warning" />;
      default: return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm flex flex-col h-full">
      <div className="p-6 pb-4 border-b border-border/50">
        <h3 className="text-lg font-semibold tracking-tight">Activity Feed</h3>
        <p className="text-sm text-muted-foreground">Real-time system events</p>
      </div>
      <div className="flex-1 overflow-auto p-0">
        {events.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Waiting for activity...
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {events.map(event => (
              <div key={event.id} className="p-4 flex gap-3 hover:bg-muted/10 transition-colors">
                <div className="mt-0.5">{getEventIcon(event.status)}</div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">{event.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

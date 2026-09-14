'use client';

import React from 'react';
import { CheckCircle2, PlayCircle, AlertTriangle, RefreshCw, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface TimelineEvent {
  id: string;
  status: string;
  timestamp: string | Date;
  message?: string;
}

interface ExecutionTimelineProps {
  events: TimelineEvent[];
}

export function ExecutionTimeline({ events }: ExecutionTimelineProps) {
  const getIcon = (status: string) => {
    switch (status) {
      case 'QUEUED': return <Clock className="h-5 w-5 text-primary" />;
      case 'RUNNING': return <PlayCircle className="h-5 w-5 text-info" />;
      case 'FAILED': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'RETRY_WAITING': return <RefreshCw className="h-5 w-5 text-warning" />;
      case 'COMPLETED': return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'DLQ': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default: return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getLabel = (status: string) => {
    switch (status) {
      case 'QUEUED': return 'Enqueued';
      case 'RUNNING': return 'Execution Started';
      case 'FAILED': return 'Execution Failed';
      case 'RETRY_WAITING': return 'Waiting for Retry';
      case 'COMPLETED': return 'Completed Successfully';
      case 'DLQ': return 'Moved to Dead Letter Queue';
      default: return status;
    }
  };

  if (!events || events.length === 0) {
    return <div className="text-sm text-muted-foreground p-4 bg-muted/20 rounded-md">No timeline data available.</div>;
  }

  // Sort events chronologically if they aren't already
  const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="relative border-l border-border/50 ml-3 pl-6 space-y-6 py-2">
      {sortedEvents.map((event, index) => {
        const isLast = index === sortedEvents.length - 1;
        const time = new Date(event.timestamp);

        return (
          <div key={event.id} className="relative">
            <div className="absolute -left-9 top-1 bg-background rounded-full">
              {getIcon(event.status)}
            </div>
            <div>
              <h4 className={`text-sm font-semibold ${isLast ? 'text-foreground' : 'text-muted-foreground'}`}>
                {getLabel(event.status)}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span>{format(time, 'MMM d, yyyy HH:mm:ss')}</span>
                <span className="text-border">•</span>
                <span>{formatDistanceToNow(time, { addSuffix: true })}</span>
              </p>
              {event.message && (
                <div className="mt-2 text-xs bg-muted/30 p-2 rounded-md font-mono text-muted-foreground whitespace-pre-wrap">
                  {event.message}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

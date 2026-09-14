'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduledJobsApi, ScheduledJob } from '@/features/scheduled-jobs/api/scheduled-jobs-api';
import { useProjects } from '@/features/projects/hooks/useProjects';
import { useQueues } from '@/features/queues/hooks/useQueues';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarClock, Play, Pause, Plus, RefreshCw } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { notify } from '@/lib/notify';

export default function ScheduledJobsPage() {
  const queryClient = useQueryClient();
  const { data: projects } = useProjects();
  const { data: queuesData } = useQueues();
  const queues = Array.isArray(queuesData) ? queuesData : (queuesData?.data || []);

  const [projectId, setProjectId] = useState<string>('');
  const effectiveProjectId = projectId || projects?.[0]?.id || '';

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['scheduled-jobs', effectiveProjectId],
    queryFn: () => scheduledJobsApi.list(effectiveProjectId || undefined),
    refetchInterval: 10000,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [queueId, setQueueId] = useState('');
  const [payloadText, setPayloadText] = useState('{\n  "taskType": "demo"\n}');

  const projectQueues = queues.filter((q: { id: string; name: string; projectId?: string }) => q.projectId === effectiveProjectId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scheduled-jobs'] });

  const createMutation = useMutation({
    mutationFn: scheduledJobsApi.create,
    onSuccess: () => {
      notify.success('Schedule created.');
      setShowForm(false);
      setName('');
      invalidate();
    },
    onError: (err) => {
      const e = err as { response?: { data?: { error?: string } } };
      notify.error(e.response?.data?.error || 'Failed to create schedule.');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      scheduledJobsApi.updateStatus(id, status),
    onSuccess: (s) => {
      notify.success(`Schedule ${s.status === 'ACTIVE' ? 'resumed' : 'paused'}.`);
      invalidate();
    },
    onError: () => notify.error('Failed to update schedule.'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    let payload: Record<string, unknown> | undefined;
    if (payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText);
      } catch {
        notify.error('Payload must be valid JSON.');
        return;
      }
    }
    createMutation.mutate({
      projectId: effectiveProjectId,
      name,
      cronExpression,
      timezone: timezone || 'UTC',
      queueId: queueId || undefined,
      payload,
    });
  };

  const inputCls =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow';

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scheduled Jobs</h1>
          <p className="text-muted-foreground mt-1">Cron-driven job materialization per project.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Schedule
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Project</label>
        <select
          value={effectiveProjectId}
          onChange={(e) => { setProjectId(e.target.value); setQueueId(''); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {projects?.map((p: { id: string; name: string }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-border/50 bg-card p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="nightly-rollup" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cron Expression</label>
              <input value={cronExpression} onChange={e => setCronExpression(e.target.value)} required className={inputCls} placeholder="*/5 * * * *" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Timezone</label>
              <input value={timezone} onChange={e => setTimezone(e.target.value)} className={inputCls} placeholder="UTC" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Queue (optional — falls back to project default)</label>
              <select value={queueId} onChange={e => setQueueId(e.target.value)} className={inputCls}>
                <option value="">Project default</option>
                {projectQueues.map((q: { id: string; name: string }) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Payload (JSON)</label>
            <textarea
              value={payloadText}
              onChange={e => setPayloadText(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMutation.isPending || !effectiveProjectId}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-medium bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading schedules...
          </div>
        ) : !schedules || schedules.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No schedules yet"
            description="Create a cron schedule to materialize jobs automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/20">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-l-lg">Name</th>
                  <th className="px-4 py-3 font-medium">Cron</th>
                  <th className="px-4 py-3 font-medium">Timezone</th>
                  <th className="px-4 py-3 font-medium">Next Run</th>
                  <th className="px-4 py-3 font-medium">Last Run</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium rounded-r-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s: ScheduledJob) => (
                  <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.cronExpression}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.timezone}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.nextRunAt ? (
                        <span title={format(new Date(s.nextRunAt), 'PPpp')}>
                          {formatDistanceToNow(new Date(s.nextRunAt), { addSuffix: true })}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.lastRunAt ? formatDistanceToNow(new Date(s.lastRunAt), { addSuffix: true }) : 'never'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.status === 'ACTIVE'
                          ? 'bg-success/15 text-success'
                          : s.status === 'PAUSED'
                            ? 'bg-warning/15 text-warning'
                            : 'bg-destructive/15 text-destructive'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => statusMutation.mutate({
                          id: s.id,
                          status: s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                        })}
                        disabled={statusMutation.isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 disabled:opacity-50 transition-colors"
                      >
                        {s.status === 'ACTIVE'
                          ? <><Pause className="h-3 w-3" /> Pause</>
                          : <><Play className="h-3 w-3" /> Resume</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

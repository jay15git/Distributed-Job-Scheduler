'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi, ApiKeyMeta } from '@/features/apikeys/api/apikeys-api';
import { useProjects } from '@/features/projects/hooks/useProjects';
import { EmptyState } from '@/components/ui/EmptyState';
import { Key, Copy, Ban, RefreshCw, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ALL_SCOPES = [
  'JOB_READ', 'JOB_WRITE', 'JOB_RETRY', 'JOB_DELETE',
  'QUEUE_READ', 'QUEUE_WRITE', 'PROJECT_READ', 'PROJECT_WRITE',
  'ORGANIZATION_READ', 'WORKER_READ', 'METRICS_READ',
];

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState<string>('');
  const effectiveProjectId = projectId || projects?.[0]?.id || '';

  const { data: keys, isLoading } = useQuery({
    queryKey: ['apikeys', effectiveProjectId],
    queryFn: () => apiKeysApi.list(effectiveProjectId),
    enabled: !!effectiveProjectId,
  });

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['JOB_READ']);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['apikeys', effectiveProjectId] });

  const createMutation = useMutation({
    mutationFn: () => apiKeysApi.create(effectiveProjectId, { name, scopes }),
    onSuccess: (data) => {
      setFreshToken(data.token);
      setName('');
      invalidate();
    },
  });
  const revokeMutation = useMutation({ mutationFn: (id: string) => apiKeysApi.revoke(id), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: (id: string) => apiKeysApi.remove(id), onSuccess: invalidate });

  const toggleScope = (s: string) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">Manage programmatic access to the scheduler.</p>
        </div>
        <select
          className="px-3 py-2 rounded-md border border-border bg-background text-sm"
          value={effectiveProjectId}
          onChange={e => setProjectId(e.target.value)}
        >
          {(projects ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {freshToken && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium text-emerald-400">Key created — copy it now. It will never be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-background/60 px-3 py-2 text-xs">{freshToken}</code>
            <button
              onClick={() => navigator.clipboard.writeText(freshToken)}
              className="rounded-md border border-border px-3 py-2 text-xs hover:bg-muted flex items-center gap-1"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button onClick={() => setFreshToken(null)} className="text-xs text-muted-foreground hover:underline">Dismiss</button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border/60 p-4 flex flex-col gap-3">
        <h2 className="font-medium text-sm">Create key</h2>
        <input
          className="px-3 py-2 rounded-md border border-border bg-background text-sm"
          placeholder="Key name (e.g. ci-pipeline)"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {ALL_SCOPES.map(s => (
            <button
              key={s}
              onClick={() => toggleScope(s)}
              className={`px-2 py-1 rounded text-xs border ${scopes.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          disabled={!name || scopes.length === 0 || !effectiveProjectId || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="self-start px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          <Key className="h-4 w-4" /> Create API Key
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading keys…</p>
      ) : !keys || keys.length === 0 ? (
        <EmptyState icon={Key} title="No API keys" description="Create a key to let services enqueue and manage jobs." />
      ) : (
        <div className="rounded-md border border-border/60 divide-y divide-border/40">
          {keys.map((k: ApiKeyMeta) => (
            <div key={k.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{k.name} <span className="text-muted-foreground font-mono text-xs">{k.prefix}…</span></p>
                <p className="text-xs text-muted-foreground">
                  {k.scopes.join(', ')}
                  {k.lastUsedAt && ` · last used ${formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })}`}
                  {k.isRevoked && ' · REVOKED'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button title="Revoke" disabled={k.isRevoked} onClick={() => revokeMutation.mutate(k.id)} className="p-2 rounded hover:bg-muted disabled:opacity-40"><Ban className="h-4 w-4" /></button>
                <button title="Delete" onClick={() => deleteMutation.mutate(k.id)} className="p-2 rounded hover:bg-muted text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

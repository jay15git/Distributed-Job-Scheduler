'use client';

import { FutureFeaturePlaceholder } from '@/components/ui/FutureFeaturePlaceholder';
import { Key } from 'lucide-react';

export default function ApiKeysPage() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">Manage programmatic access to the scheduler.</p>
        </div>
        <button disabled className="px-4 py-2 bg-primary/50 text-primary-foreground/50 rounded-md font-medium text-sm cursor-not-allowed flex items-center gap-2">
          <Key className="h-4 w-4" />
          Create API Key
        </button>
      </div>

      <FutureFeaturePlaceholder 
        title="API Key Management Upcoming" 
        description="The backend currently does not expose API Key management endpoints. This interface (creation, rotation, and revocation) will become active once backend support is added." 
        backendVersion="v1.0.0-backend" 
      />
    </div>
  );
}

'use client';

import { FutureFeaturePlaceholder } from '@/components/ui/FutureFeaturePlaceholder';
import { Search, Filter } from 'lucide-react';

export default function AuditLogsPage() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">Investigate system events and user actions.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center p-4 bg-card border border-border/50 rounded-xl shadow-sm opacity-50 pointer-events-none grayscale">
        <div className="flex flex-1 items-center gap-4 w-full">
          <div className="flex items-center gap-2 max-w-md w-full relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Actor or Resource..."
              disabled
              className="w-full bg-muted/50 border border-border/50 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <button disabled className="px-3 py-2 border border-border/50 rounded-md text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden opacity-50 pointer-events-none grayscale">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border/50">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">Actor</th>
                <th scope="col" className="px-6 py-4 font-medium">Action</th>
                <th scope="col" className="px-6 py-4 font-medium">Resource</th>
                <th scope="col" className="px-6 py-4 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="px-6 py-8"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <FutureFeaturePlaceholder 
        title="Audit Logs Unavailable" 
        description="No audit log endpoint is available in v1.0.0-backend. This interface will become active once backend support is added." 
        backendVersion="v1.0.0-backend" 
      />
    </div>
  );
}

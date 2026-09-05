'use client';

import React from 'react';
import { useOrganizations } from '@/features/organizations/hooks/useOrganizations';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefreshIndicator } from '@/components/ui/RefreshIndicator';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { Building2, Users, Calendar, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function OrganizationsPage() {
  const { data: orgs, isLoading, isError, isFetching } = useOrganizations();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground mt-1">Manage tenants and organizational access.</p>
        </div>
        <div className="flex items-center gap-4">
          <RefreshIndicator intervalSeconds={5} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <EmptyState 
          icon={Building2}
          title="Failed to load organizations"
          description="There was an error communicating with the server."
        />
      ) : !orgs || orgs.length === 0 ? (
        <EmptyState 
          icon={Building2}
          title="No organizations found"
          description="You are not a member of any organizations yet."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orgs.map((org: any) => (
            <div key={org.id} className="bg-card border border-border/50 rounded-xl p-5 shadow-sm hover:border-primary/50 transition-colors flex flex-col cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{org.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{org.slug}</p>
                  </div>
                </div>
                <div className="px-2.5 py-0.5 rounded-full bg-success/20 text-success text-xs font-medium">
                  Active
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-border/50">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-xs">Members</span>
                  </div>
                  <span className="text-sm font-medium">{org._count?.members || 1}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="text-xs">Created</span>
                  </div>
                  <span className="text-sm font-medium">
                    {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

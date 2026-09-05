'use client';

import React from 'react';
import { useProjects } from '@/features/projects/hooks/useProjects';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefreshIndicator } from '@/components/ui/RefreshIndicator';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { FolderGit2, Calendar, Server, Tag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function ProjectsPage() {
  const { data: projects, isLoading, isError, isFetching } = useProjects();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage scheduling environments and logical groupings.</p>
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
          icon={FolderGit2}
          title="Failed to load projects"
          description="There was an error communicating with the server."
        />
      ) : !projects || projects.length === 0 ? (
        <EmptyState 
          icon={FolderGit2}
          title="No projects found"
          description="You do not have access to any projects in this organization."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project: any) => (
            <div key={project.id} className="bg-card border border-border/50 rounded-xl p-5 shadow-sm hover:border-primary/50 transition-colors flex flex-col cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <FolderGit2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{project.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {project.description || "No description provided."}
                    </p>
                  </div>
                </div>
                <div className="px-2.5 py-0.5 rounded-full bg-success/20 text-success text-xs font-medium uppercase tracking-wider">
                  {project.status}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-border/50">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Server className="h-3.5 w-3.5" />
                    <span className="text-xs">Environment</span>
                  </div>
                  <span className="text-sm font-medium capitalize">{project.environment.toLowerCase()}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="text-xs">Created</span>
                  </div>
                  <span className="text-sm font-medium">
                    {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
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

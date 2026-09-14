'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ListTree, 
  ListTodo,
  Settings, 
  Activity, 
  Server,
  Layers,
  Key,
  ShieldAlert,
  Boxes,
  Building2,
  FolderGit2,
  CalendarClock,
  Network
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Jobs', href: '/jobs', icon: ListTodo },
  { name: 'Scheduled Jobs', href: '/scheduled-jobs', icon: CalendarClock },
  { name: 'Queues', href: '/queues', icon: Boxes },
  { name: 'Workers', href: '/workers', icon: Server },
];

const adminNavigation = [
  { name: 'Organizations', href: '/organizations', icon: Building2 },
  { name: 'Projects', href: '/projects', icon: FolderGit2 },
  { name: 'API Keys', href: '/apikeys', icon: Key },
  { name: 'Audit Logs', href: '/audit', icon: ShieldAlert },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  
  // Basic RBAC check for UI, real enforcement is on the backend
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-sidebar px-4 py-6">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Network className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Nexus Scheduler</span>
      </div>

      <nav className="flex-1 space-y-1">
        <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platform
        </div>
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
              {item.name}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="mt-8 mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Administration
            </div>
            {adminNavigation.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>
      
      <div className="mt-auto px-2 pt-4">
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3 mb-4">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">{user?.email || 'User'}</span>
            <span className="truncate text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ').toLowerCase() || 'Member'}</span>
          </div>
        </div>
        <div className="text-center text-[10px] text-muted-foreground/60 mb-2">
          Jayant Acharya.
        </div>
      </div>
    </div>
  );
}

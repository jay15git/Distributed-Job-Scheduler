'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App Route Error:', error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6 text-destructive shadow-sm">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-2">Something went wrong!</h2>
      <p className="text-muted-foreground max-w-md mx-auto mb-8">
        We encountered an unexpected error while loading this page. 
        <br />
        <span className="text-xs font-mono mt-2 block bg-muted/50 p-2 rounded border border-border/50 text-left overflow-hidden text-ellipsis">
          {error.message || 'Unknown error occurred.'}
        </span>
      </p>
      <button
        onClick={() => reset()}
        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-6 gap-2"
      >
        <RefreshCcw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}

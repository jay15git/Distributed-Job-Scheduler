'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="flex flex-col items-center justify-center text-center max-w-md w-full border border-border bg-card p-8 rounded-xl shadow-lg">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6 text-destructive">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Fatal Application Error</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            The application encountered a critical error and could not recover.
          </p>
          <div className="w-full bg-muted/50 p-3 rounded border border-border/50 text-left overflow-hidden text-ellipsis mb-8">
            <code className="text-xs text-foreground font-mono break-words">
              {error.message || 'Unknown error occurred.'}
            </code>
          </div>
          <button
            onClick={() => reset()}
            className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4"
          >
            Attempt Recovery
          </button>
        </div>
      </body>
    </html>
  );
}

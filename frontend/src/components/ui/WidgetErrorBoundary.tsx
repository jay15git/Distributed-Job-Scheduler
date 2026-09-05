'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Widget caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center border border-border/50 rounded-xl bg-card">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold mb-1">
            {this.props.title || 'Widget Error'}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
            {this.state.error?.message || 'Failed to render this component.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

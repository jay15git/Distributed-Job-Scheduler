'use client';

import React, { useState } from 'react';
import { JsonView, allExpanded, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  title?: string;
}

// Custom styles to match the dark theme closely
const customDarkStyles = {
  ...darkStyles,
  container: 'bg-muted/30 rounded-md p-4 text-sm font-mono',
  label: 'text-primary',
  nullValue: 'text-muted-foreground',
  undefinedValue: 'text-muted-foreground',
  numberValue: 'text-info',
  stringValue: 'text-success',
  booleanValue: 'text-warning',
};

export function JsonViewer({ data, title }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON', err);
    }
  };

  if (!data) return <div className="text-sm text-muted-foreground italic p-4 bg-muted/20 rounded-md">No data available</div>;

  return (
    <div className="relative group rounded-md overflow-hidden border border-border/50">
      {title && (
        <div className="bg-muted/50 px-4 py-2 border-b border-border/50 text-xs font-semibold text-muted-foreground flex justify-between items-center">
          <span>{title}</span>
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted hover:text-foreground"
        title="Copy JSON"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </button>
      <div className="max-h-[400px] overflow-auto custom-scrollbar">
        <JsonView data={data} shouldExpandNode={allExpanded} style={customDarkStyles} />
      </div>
    </div>
  );
}

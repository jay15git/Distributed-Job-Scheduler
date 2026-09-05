'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  ComposedChart
} from 'recharts';
import { format } from 'date-fns';
import { PerformanceSample } from '../types/dashboard';

interface PerformanceTimelineProps {
  history: PerformanceSample[];
  isError: boolean;
}

export function PerformanceTimeline({ history, isError }: PerformanceTimelineProps) {
  if (isError) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Performance Timeline</h3>
        <div className="text-sm text-muted-foreground">Timeline unavailable</div>
      </div>
    );
  }

  // Format the data for recharts
  const data = history.map((sample) => ({
    ...sample,
    timeLabel: format(sample.timestamp, 'HH:mm:ss'),
  }));

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm flex flex-col h-[400px]">
      <div className="p-6 pb-2">
        <h3 className="text-lg font-semibold tracking-tight">Performance Timeline</h3>
        <p className="text-sm text-muted-foreground">Last 5 minutes (Jobs/sec, Queue Depth, Latency)</p>
      </div>
      <div className="p-6 pt-4 flex-1">
        {data.length < 2 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Collecting performance data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorQueueDepth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
              <XAxis 
                dataKey="timeLabel" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }} 
                minTickGap={30}
              />
              <YAxis 
                yAxisId="left" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: 'var(--color-card)', 
                  borderColor: 'var(--color-border)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  color: 'var(--color-foreground)'
                }}
                itemStyle={{ fontSize: '14px' }}
                labelStyle={{ color: 'var(--color-muted-foreground)', marginBottom: '4px' }}
              />
              
              {/* Queue Depth (Area) */}
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="queueDepth" 
                name="Queue Depth"
                stroke="var(--color-primary)" 
                fillOpacity={1} 
                fill="url(#colorQueueDepth)" 
                isAnimationActive={false}
              />
              
              {/* Latency (Line on right axis) */}
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="avgExecutionLatencyMs" 
                name="Avg Latency (ms)"
                stroke="var(--color-warning)" 
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

import client from 'prom-client';

export const dlqEntriesTotal = new client.Counter({
  name: 'djs_dlq_entries_total',
  help: 'Total number of jobs moved to Dead Letter Queue',
  labelNames: ['queue_id', 'failure_category'],
});

export const dlqResolutionTotal = new client.Counter({
  name: 'djs_dlq_resolution_total',
  help: 'Total number of jobs resolved from DLQ (replayed or deleted)',
  labelNames: ['queue_id', 'resolution_type'], // e.g., 'replayed', 'discarded'
});

export const dlqDepth = new client.Gauge({
  name: 'djs_dlq_depth',
  help: 'Current number of jobs residing in DLQ',
  labelNames: ['queue_id'],
});

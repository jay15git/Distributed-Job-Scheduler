import client from 'prom-client';

export const schedulerTicksTotal = new client.Counter({
  name: 'djs_scheduler_ticks_total',
  help: 'Total scheduler ticks executed',
});

export const schedulerTickDurationSeconds = new client.Histogram({
  name: 'djs_scheduler_tick_duration_seconds',
  help: 'Duration of scheduler tick loop',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const scheduledJobsProcessedTotal = new client.Counter({
  name: 'djs_scheduled_jobs_processed_total',
  help: 'Total scheduled jobs that became due and were enqueued',
});

export const scheduledJobsFailedTotal = new client.Counter({
  name: 'djs_scheduled_jobs_failed_total',
  help: 'Total scheduled jobs that failed to enqueue',
});

export const queueSyncTotal = new client.Counter({
  name: 'djs_queue_sync_total',
  help: 'Total number of queue synchronization cycles',
});

export const queueSyncDurationSeconds = new client.Histogram({
  name: 'djs_queue_sync_duration_seconds',
  help: 'Duration of queue sync operation',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

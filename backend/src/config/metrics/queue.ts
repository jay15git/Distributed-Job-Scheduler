import client from 'prom-client';

export const queueDepth = new client.Gauge({
  name: 'djs_queue_depth',
  help: 'Current number of jobs waiting in queue',
  labelNames: ['queue_id'],
});

export const queueWaitDurationSeconds = new client.Histogram({
  name: 'djs_queue_wait_duration_seconds',
  help: 'Time spent by a job waiting in queue before claim',
  labelNames: ['queue_id'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600, 1800, 3600],
});

export const queueOldestJobAgeSeconds = new client.Gauge({
  name: 'djs_queue_oldest_job_age_seconds',
  help: 'Age of the oldest un-claimed job in the queue in seconds',
  labelNames: ['queue_id'],
});

export const queueDrainRate = new client.Gauge({
  name: 'djs_queue_drain_rate',
  help: 'Rate of jobs being processed per second',
  labelNames: ['queue_id'],
});

export const queueEnqueueRate = new client.Gauge({
  name: 'djs_queue_enqueue_rate',
  help: 'Rate of new jobs being enqueued per second',
  labelNames: ['queue_id'],
});

export const jobsCancelledTotal = new client.Counter({
  name: 'djs_jobs_cancelled_total',
  help: 'Total number of job cancellations requested via the API',
  labelNames: ['queue_id', 'phase'], // 'pre_dispatch' (QUEUED/SCHEDULED/BLOCKED/RETRY_WAITING) or 'in_flight' (CLAIMED/RUNNING)
});

export const jobsRunning = new client.Gauge({
  name: 'djs_jobs_running',
  help: 'Current number of executing jobs',
  labelNames: ['queue_id'],
});

export const jobsRejectedTotal = new client.Counter({
  name: 'djs_jobs_rejected_total',
  help: 'Jobs rejected at enqueue time',
  labelNames: ['queue_id', 'reason'], // rate_limited | depth_exceeded | payload_too_large | queue_inactive
});

export const queueConcurrencySaturatedTotal = new client.Counter({
  name: 'djs_queue_concurrency_saturated_total',
  help: 'Claim attempts skipped because the queue hit its concurrencyLimit',
  labelNames: ['queue_id'],
});

export const jobExecutionTimeoutsTotal = new client.Counter({
  name: 'djs_job_execution_timeouts_total',
  help: 'Jobs that exceeded the queue maxExecutionTime',
  labelNames: ['queue_id'],
});

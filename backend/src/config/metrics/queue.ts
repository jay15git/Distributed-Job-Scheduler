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

export const jobsRunning = new client.Gauge({
  name: 'djs_jobs_running',
  help: 'Current number of executing jobs',
  labelNames: ['queue_id'],
});

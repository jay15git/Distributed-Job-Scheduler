import client from 'prom-client';

export const workerJobsClaimedTotal = new client.Counter({
  name: 'djs_worker_jobs_claimed_total',
  help: 'Total jobs claimed by worker',
  labelNames: ['worker_id', 'queue'],
});

export const workerJobsCompletedTotal = new client.Counter({
  name: 'djs_worker_jobs_completed_total',
  help: 'Total jobs successfully completed by worker',
  labelNames: ['worker_id', 'queue', 'job_type'],
});

export const workerJobsFailedTotal = new client.Counter({
  name: 'djs_worker_jobs_failed_total',
  help: 'Total jobs failed by worker',
  labelNames: ['worker_id', 'queue', 'job_type', 'error_code'],
});

export const workerClaimLatencySeconds = new client.Histogram({
  name: 'djs_worker_claim_latency_seconds',
  help: 'Time taken to claim a job from queue',
  labelNames: ['worker_id', 'queue'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

export const workerExecutionDurationSeconds = new client.Histogram({
  name: 'djs_worker_execution_duration_seconds',
  help: 'Job execution duration in seconds',
  labelNames: ['worker_id', 'queue', 'job_type'],
  buckets: [0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
});

export const workerHeartbeatTotal = new client.Counter({
  name: 'djs_worker_heartbeat_total',
  help: 'Total heartbeats emitted by worker',
  labelNames: ['worker_id'],
});

export const workerUtilization = new client.Gauge({
  name: 'djs_worker_utilization',
  help: 'Ratio of active jobs to max concurrency per worker',
  labelNames: ['worker_id'],
});

export const workersOnline = new client.Gauge({
  name: 'djs_workers_online',
  help: 'Current number of workers online',
});

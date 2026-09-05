import client from 'prom-client';

export const retryTotal = new client.Counter({
  name: 'djs_retry_total',
  help: 'Total number of job retries initiated',
  labelNames: ['queue_id', 'job_type'],
});

export const retrySuccessTotal = new client.Counter({
  name: 'djs_retry_success_total',
  help: 'Total number of jobs that eventually succeeded after retry',
  labelNames: ['queue_id', 'job_type'],
});

export const retryFailureTotal = new client.Counter({
  name: 'djs_retry_failure_total',
  help: 'Total number of jobs that failed after exhausting all retries',
  labelNames: ['queue_id', 'job_type'],
});

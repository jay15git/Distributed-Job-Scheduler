import client from 'prom-client';

export const httpRequestsTotal = new client.Counter({
  name: 'djs_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'djs_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const httpRequestErrorsTotal = new client.Counter({
  name: 'djs_http_request_errors_total',
  help: 'Total number of HTTP requests resulting in error',
  labelNames: ['method', 'route'],
});

export const httpActiveRequests = new client.Gauge({
  name: 'djs_http_active_requests',
  help: 'Number of active HTTP requests',
});

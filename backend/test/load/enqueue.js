import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, standardThresholds, generateReport, createHeaders, setupTestEnvironment, login } from './utils.js';

export const enqueueLatency = new Trend('enqueue_latency');
export const enqueueRate = new Rate('enqueue_success_rate');
export const enqueueThroughput = new Counter('jobs_enqueued');

// Target: Enqueue P95 < 100ms
export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    ...standardThresholds(100),
    'enqueue_latency': ['p(95)<100'],
  },
};

export function setup() {
  const token = __ENV.ADMIN_TOKEN || login('loadtest@example.com', 'LoadTest123!');
  if (!token) throw new Error('Could not get token');
  
  const env = setupTestEnvironment(token);
  return { token, ...env };
}

export default function (data) {
  const headers = createHeaders(data.token);

  const start = Date.now();
  const res = http.post(`${BASE_URL}/jobs`, JSON.stringify({ queueId: data.queueId,
    name: `Load Test Job ${__VU}-${__ITER}`,
    payload: { task: 'compute', load: 100 },
    type: 'IMMEDIATE',
    priority: 5
  }), { headers });

  const duration = Date.now() - start;
  enqueueLatency.add(duration);
  enqueueThroughput.add(1);
  enqueueRate.add(res.status === 201);

  check(res, { 'job created successfully': (r) => r.status === 201 });
}

export function handleSummary(data) {
  return generateReport(data, 'enqueue');
}

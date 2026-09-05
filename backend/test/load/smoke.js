import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, standardThresholds, generateReport, createHeaders, setupTestEnvironment, login } from './utils.js';

export const options = {
  vus: 1,
  iterations: 1, // Only run once for the smoke test
  thresholds: standardThresholds(200),
};

export function setup() {
  const token = __ENV.ADMIN_TOKEN || login('loadtest@example.com', 'LoadTest123!');
  if (!token) throw new Error('Could not get token');
  
  const env = setupTestEnvironment(token);
  return { token, ...env };
}

export default function (data) {
  const headers = createHeaders(data.token);

  // 1. API Health Check
  const healthRes = http.get(`${BASE_URL}/health/live`);
  check(healthRes, { 'api is live': (r) => r.status === 200 });

  // 2. Queue Creation (done in setup via setupTestEnvironment, but let's list them)
  const res = http.get(`${BASE_URL}/queues?projectId=${data.projectId}`, { headers });
  check(res, { 'queues fetched successfully': (r) => r.status === 200 });

  // 3. Job Enqueue
  const jobRes = http.post(`${BASE_URL}/jobs`, JSON.stringify({ queueId: data.queueId,
    name: 'Smoke Test Job',
    payload: { task: 'echo', data: 'hello smoke' },
    type: 'IMMEDIATE'
  }), { headers });

  check(jobRes, { 'job submitted successfully': (r) => r.status === 201 });
  const jobId = jobRes.json('id');

  // 4. Scheduler processes job & 5. Worker executes job & 6. Job completes
  // Poll job status until it is COMPLETED or max retries reached
  let isCompleted = false;
  for (let i = 0; i < 15; i++) {
    sleep(1);
    const statusRes = http.get(`${BASE_URL}/jobs/${jobId}`, { headers });
    const status = statusRes.json('status');
    if (status === 'COMPLETED') {
      isCompleted = true;
      break;
    }
  }

  check(isCompleted, { 'job completed successfully': (c) => c === true });

  // 7. Metrics endpoint responds
  const metricsRes = http.get(`${__ENV.API_URL.replace("/api/v1", "")}/metrics`);
  check(metricsRes, { 
    'metrics endpoint accessible': (r) => r.status === 200,
    'metrics contain HTTP data': (r) => r.body.includes('djs_http_requests_total'),
    'metrics contain Worker data': (r) => r.body.includes('djs_worker_jobs_completed_total')
  });
}

export function handleSummary(data) {
  return generateReport(data, 'smoke');
}

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, standardThresholds, generateReport, createHeaders, setupTestEnvironment, login } from './utils.js';

// Target: P95 < 200ms
export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up to 20 users
    { duration: '1m', target: 20 },  // Stay at 20 users
    { duration: '10s', target: 0 },  // Ramp down
  ],
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

  // 1. Fetch queues
  let res = http.get(`${BASE_URL}/queues?projectId=${data.projectId}`, { headers });
  check(res, { 'get queues status 200': (r) => r.status === 200 });

  // 2. Fetch projects
  res = http.get(`${BASE_URL}/organizations/${data.orgId}/projects`, { headers });
  check(res, { 'get projects status 200': (r) => r.status === 200 });

  // 3. Submit a job
  res = http.post(`${BASE_URL}/jobs`, JSON.stringify({ queueId: data.queueId,
    name: `API Test Job ${__VU}-${__ITER}`,
    payload: { task: 'echo' },
    type: 'IMMEDIATE'
  }), { headers });
  check(res, { 'create job status 201': (r) => r.status === 201 });

  sleep(1);
}

export function handleSummary(data) {
  return generateReport(data, 'api');
}

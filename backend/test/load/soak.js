import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, standardThresholds, generateReport, createHeaders, setupTestEnvironment, login } from './utils.js';

export const options = {
  stages: [
    { duration: '2m', target: 50 },  // Ramp up
    { duration: '56m', target: 50 }, // Maintain 50 VUs for almost an hour
    { duration: '2m', target: 0 },   // Ramp down
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

  const res = http.post(`${BASE_URL}/jobs`, JSON.stringify({ queueId: data.queueId,
    name: `Soak Test Job`,
    payload: { task: 'compute' },
    type: 'IMMEDIATE',
  }), { headers });

  check(res, { 'job created successfully': (r) => r.status === 201 });
  
  sleep(1);
}

export function handleSummary(data) {
  return generateReport(data, 'soak');
}

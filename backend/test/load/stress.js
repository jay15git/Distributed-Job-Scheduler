import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, generateReport, createHeaders, setupTestEnvironment, login } from './utils.js';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 400 },
    { duration: '1m', target: 800 },
    { duration: '1m', target: 1200 },
    { duration: '1m', target: 0 }, // cool down
  ],
  // No strict thresholds, we expect this to break things to find the limit
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
    name: `Stress Test Job`,
    payload: { task: 'compute' },
    type: 'IMMEDIATE',
  }), { headers });

  check(res, { 'job created successfully': (r) => r.status === 201 });
}

export function handleSummary(data) {
  return generateReport(data, 'stress');
}

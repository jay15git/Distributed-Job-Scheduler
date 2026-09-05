import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, generateReport, createHeaders, setupTestEnvironment, login } from './utils.js';

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Baseline
    { duration: '1m', target: 100 },   // Maintain
    { duration: '10s', target: 10000 },// Spike to 10k!
    { duration: '3m', target: 10000 }, // Maintain spike
    { duration: '30s', target: 100 },  // Scale down
    { duration: '3m', target: 100 },   // Recovery
    { duration: '10s', target: 0 },    // Cooldown
  ],
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
    name: `Spike Test Job`,
    payload: { task: 'compute' },
    type: 'IMMEDIATE',
  }), { headers });

  check(res, { 'job created successfully': (r) => r.status === 201 });
}

export function handleSummary(data) {
  return generateReport(data, 'spike');
}

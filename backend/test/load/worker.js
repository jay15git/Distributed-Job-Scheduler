import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, standardThresholds, generateReport, createHeaders, setupTestEnvironment, login } from './utils.js';

export const e2eLatency = new Trend('job_e2e_latency');
export const completedJobs = new Counter('jobs_completed');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    ...standardThresholds(200),
    // For local dev, a fast worker should complete the job in < 500ms
    'job_e2e_latency': ['p(95)<500'],
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

  // 1. Submit
  const start = Date.now();
  const res = http.post(`${BASE_URL}/jobs`, JSON.stringify({ queueId: data.queueId,
    name: `Worker E2E Job ${__VU}-${__ITER}`,
    payload: { task: 'echo' },
    type: 'IMMEDIATE',
  }), { headers });

  if (check(res, { 'job submitted': (r) => r.status === 201 })) {
    const jobId = res.json('id');
    
    // 2. Poll for completion
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 10) {
      sleep(0.5); // poll every 500ms
      const statusRes = http.get(`${BASE_URL}/jobs/${jobId}`, { headers });
      
      if (statusRes.status === 200) {
        const state = statusRes.json('status');
        if (state === 'COMPLETED' || state === 'FAILED') {
          completed = true;
          if (state === 'COMPLETED') {
            completedJobs.add(1);
            e2eLatency.add(Date.now() - start);
          }
        }
      }
      attempts++;
    }
    
    check(completed, { 'job processed within 5s': c => c === true });
  }
}

export function handleSummary(data) {
  return generateReport(data, 'worker');
}

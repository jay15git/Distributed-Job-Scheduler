import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { BASE_URL, generateReport, createHeaders, login } from './utils.js';

// Noisy-neighbor benchmark: flood queue A while measuring queue B's
// end-to-end latency. Produces the "starvation" number — how much a hot
// queue degrades a quiet neighbor sharing the same worker pool.
export const victimEnqueueLatency = new Trend('victim_enqueue_latency');
export const victimE2ELatency = new Trend('victim_e2e_latency');
export const victimJobsCompleted = new Counter('victim_jobs_completed');
export const floodJobsEnqueued = new Counter('flood_jobs_enqueued');

export const options = {
  scenarios: {
    // Saturate queue A as fast as the API accepts work.
    flood: {
      executor: 'constant-vus',
      vus: 40,
      duration: '2m',
      exec: 'flood',
    },
    // A trickle of real e2e jobs through queue B — the metric that matters.
    victim: {
      executor: 'constant-vus',
      vus: 2,
      duration: '2m',
      exec: 'victim',
      startTime: '10s', // let the flood build backpressure first
    },
  },
  thresholds: {
    // The fairness claim: B's p95 stays bounded while A is flooded.
    'victim_e2e_latency': ['p(95)<2000'],
  },
};

export function setup() {
  const token = __ENV.ADMIN_TOKEN || login('loadtest@example.com', 'LoadTest123!');
  if (!token) throw new Error('Could not get token');
  const headers = createHeaders(token);

  const orgName = `org-starve-${Date.now()}`;
  let res = http.post(`${BASE_URL}/organizations`, JSON.stringify({ name: orgName, slug: orgName }), { headers });
  if (res.status !== 201) fail(`Failed to create org: ${res.body}`);
  const orgId = res.json('id');

  const projectName = `proj-starve-${Date.now()}`;
  res = http.post(`${BASE_URL}/projects`, JSON.stringify({ name: projectName, organizationId: orgId }), { headers });
  if (res.status !== 201) fail(`Failed to create project: ${res.body}`);
  const projectId = res.json('id');

  const queues = {};
  for (const label of ['flood', 'victim']) {
    const queueName = `q-${label}-${Date.now()}`;
    res = http.post(`${BASE_URL}/queues`, JSON.stringify({ name: queueName, projectId }), { headers });
    if (res.status !== 201) fail(`Failed to create ${label} queue: ${res.body}`);
    queues[`${label}QueueId`] = res.json('id');
  }

  return { token, orgId, projectId, ...queues };
}

export function flood(data) {
  const res = http.post(`${BASE_URL}/jobs`, JSON.stringify({
    queueId: data.floodQueueId,
    name: `Flood Job ${__VU}-${__ITER}`,
    payload: { task: 'compute', load: 100 },
    type: 'IMMEDIATE',
    priority: 5,
  }), { headers: createHeaders(data.token) });

  floodJobsEnqueued.add(1);
  check(res, { 'flood job accepted or bounded': (r) => r.status === 201 || r.status === 429 });
}

export function victim(data) {
  const headers = createHeaders(data.token);
  const start = Date.now();

  const res = http.post(`${BASE_URL}/jobs`, JSON.stringify({
    queueId: data.victimQueueId,
    name: `Victim Job ${__VU}-${__ITER}`,
    payload: { task: 'echo' },
    type: 'IMMEDIATE',
  }), { headers });

  victimEnqueueLatency.add(Date.now() - start);
  if (!check(res, { 'victim job submitted': (r) => r.status === 201 })) return;

  const jobId = res.json('id');
  let attempts = 0;
  while (attempts < 40) {
    sleep(0.5);
    const statusRes = http.get(`${BASE_URL}/jobs/${jobId}`, { headers });
    if (statusRes.status === 200) {
      const state = statusRes.json('status');
      if (state === 'COMPLETED' || state === 'FAILED') {
        if (state === 'COMPLETED') {
          victimJobsCompleted.add(1);
          victimE2ELatency.add(Date.now() - start);
        }
        return;
      }
    }
    attempts++;
  }

  check(false, { 'victim job processed within 20s': c => c === true });
}

export function handleSummary(data) {
  return generateReport(data, 'starvation');
}

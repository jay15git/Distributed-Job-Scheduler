import http from 'k6/http';
import { check, fail } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

export const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';

// Standard metrics tracking
export function standardThresholds(p95ApiLatency = 200) {
  return {
    http_req_failed: ['rate<0.01'], // < 1% errors
    http_req_duration: [`p(95)<${p95ApiLatency}`], // 95% of requests must complete below limit
    checks: ['rate>0.99'], // >99% of checks successful
  };
}

export function generateReport(data, filename) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`reports/${filename}-summary.json`]: JSON.stringify(data),
  };
}

// Auth helper
export function login(email, password) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (check(res, { 'login successful': (r) => r.status === 200 })) {
    return res.json('data.accessToken');
  } else {
    console.error(`Login failed: ${res.body}`);
    return null;
  }
}

export function createHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// Simplified setup assuming pre-existing project/queue or creating them if needed
export function setupTestEnvironment(token) {
  const headers = createHeaders(token);
  
  // Create an org
  const orgName = `org-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  let res = http.post(`${BASE_URL}/organizations`, JSON.stringify({ name: orgName, slug: orgName }), { headers });
  if (res.status !== 201) {
    fail(`Failed to create org: ${res.body}`);
  }
  const orgId = res.json('id');

  // Create a project
  const projectName = `proj-${Date.now()}`;
  res = http.post(`${BASE_URL}/projects`, JSON.stringify({ name: projectName, organizationId: orgId }), { headers });
  if (res.status !== 201) {
    fail(`Failed to create project: ${res.body}`);
  }
  const projectId = res.json('id');

  // Create a queue
  const queueName = `q-${Date.now()}`;
  res = http.post(`${BASE_URL}/queues`, JSON.stringify({ name: queueName, projectId: projectId }), { headers });
  if (res.status !== 201) {
    fail(`Failed to create queue: ${res.body}`);
  }
  const queueId = res.json('id');

  return { orgId, projectId, queueId };
}

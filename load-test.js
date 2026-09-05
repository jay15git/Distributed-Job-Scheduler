import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 20 }, // Ramp up to 20 users
    { duration: '15s', target: 20 }, // Stay at 20 users for 15 seconds
    { duration: '5s', target: 0 }, // Ramp down to 0 users
  ],
};

const API_URL = 'http://api:3000/api/v1'; // use api service name for docker network

export default function () {
  const loginRes = http.post(`${API_URL}/auth/login`, JSON.stringify({
    email: 'alice@acme.com',
    password: 'password123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  const token = loginRes.json('data.token');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const req1 = {
    method: 'GET',
    url: `${API_URL}/dashboard`,
    params: { headers },
  };

  const req2 = {
    method: 'GET',
    url: `${API_URL}/jobs?page=1&limit=20`,
    params: { headers },
  };

  const req3 = {
    method: 'GET',
    url: `${API_URL}/queues`,
    params: { headers },
  };

  const responses = http.batch([req1, req2, req3]);

  check(responses[0], { 'dashboard 200': (r) => r.status === 200 });
  check(responses[1], { 'jobs 200': (r) => r.status === 200 });
  check(responses[2], { 'queues 200': (r) => r.status === 200 });

  sleep(1);
}

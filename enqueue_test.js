const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';

async function enqueueJobs() {
  console.log('Logging in...');
  const loginRes = await axios.post(`${API_URL}/auth/login`, {
    email: 'alice@acme.com',
    password: 'password123'
  });
  
  const token = loginRes.data.data.token;
  const headers = { 'Authorization': `Bearer ${token}` };

  console.log('Enqueuing jobs for testing...');

  // Successful job
  await axios.post(`${API_URL}/jobs`, {
    type: 'test-job',
    queue: 'default',
    payload: { success: true },
    options: {
      type: 'IMMEDIATE'
    }
  }, { headers });

  // Job that fails and gets retried
  await axios.post(`${API_URL}/jobs`, {
    type: 'test-job',
    queue: 'default',
    payload: { fail: true },
    options: {
      type: 'IMMEDIATE',
      maxRetries: 2,
      retryBackoffMs: 1000
    }
  }, { headers });

  // Delayed job
  await axios.post(`${API_URL}/jobs`, {
    type: 'test-job',
    queue: 'default',
    payload: { delayed: true },
    options: {
      type: 'SCHEDULED',
      runAt: new Date(Date.now() + 60000).toISOString() // 1 minute from now
    }
  }, { headers });

  console.log('Jobs enqueued successfully.');
}

enqueueJobs().catch(console.error);

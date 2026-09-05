const fetch = require('node-fetch');

async function testEndpoints() {
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@acme.com', password: 'password123' })
  });
  
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;
  console.log("Token received:", token ? 'yes' : 'no');

  const queuesRes = await fetch('http://localhost:3000/api/v1/queues', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Queues status:", queuesRes.status);

  const jobsRes = await fetch('http://localhost:3000/api/v1/jobs', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Jobs status:", jobsRes.status);
  
  const workersRes = await fetch('http://localhost:3000/api/v1/workers', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Workers status:", workersRes.status);
  const workersData = await workersRes.json();
  console.log("Workers data:", workersData.data[0]);
}

testEndpoints();

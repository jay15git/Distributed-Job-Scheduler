fetch('http://localhost:3000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'alice@acme.com', password: 'password123' })
})
.then(res => res.json().then(data => console.log(res.status, data)))
.catch(console.error);

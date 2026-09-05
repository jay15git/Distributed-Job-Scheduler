const fetch = require('node-fetch');

async function flood() {
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@acme.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;
  const queueId = '777a5759-374b-42c6-99c2-7a84fcafe13c';

  const jobDefinitions = [
    // EMAIL
    { name: "Send Welcome Email", taskType: "email", payload: { to: "user@example.com" } },
    { name: "Send Password Reset Email", taskType: "email", payload: { to: "user@example.com", action: "reset" } },
    { name: "Send Order Confirmation", taskType: "email", payload: { orderId: "ORD-123", to: "user@example.com" } },
    
    // DOCUMENT
    { name: "Generate Monthly Invoice PDF", taskType: "pdf", payload: { template: "invoice", amount: 100 } },
    { name: "Generate Customer Statement", taskType: "pdf", payload: { customerId: "CUST-456" } },
    { name: "Process Document OCR", taskType: "pdf", payload: { documentId: "DOC-789" } },
    
    // WEBHOOK
    { name: "Process Payment Webhook", taskType: "webhook", payload: { url: "https://api.example.com/payment" } },
    { name: "Process Order Status Webhook", taskType: "webhook", payload: { url: "https://api.example.com/order-status" } },
    
    // DATA PROCESSING
    { name: "Generate Analytics Report", taskType: "data_processing", payload: { dataset: "analytics" } },
    { name: "Import Customer Records", taskType: "data_processing", payload: { source: "s3://imports/" } },
    { name: "Synchronize Inventory", taskType: "data_processing", payload: { storeId: "STORE-1" } },
    { name: "Aggregate Daily Metrics", taskType: "data_processing", payload: { dataset: "daily_metrics" } },
    
    // SYSTEM
    { name: "Archive Expired Records", taskType: "system", payload: { days: 30 } },
    { name: "Clean Expired Sessions", taskType: "system", payload: { table: "sessions" } },
    { name: "Run Scheduled Database Backup", taskType: "system", payload: { target: "s3://backups" } }
  ];

  console.log("Starting to flood jobs...");
  
  // Flood 100 jobs, 10 at a time
  for (let i = 0; i < 10; i++) {
    const promises = [];
    for (let j = 0; j < 10; j++) {
      const def = jobDefinitions[Math.floor(Math.random() * jobDefinitions.length)];
      promises.push(fetch('http://localhost:3000/api/v1/jobs', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: def.name,
          queueId: queueId,
          type: 'IMMEDIATE',
          payload: { ...def.payload, taskType: def.taskType, iteration: i * 10 + j },
          priority: 5
        })
      }));
    }
    await Promise.all(promises);
    console.log(`Sent batch ${i+1}/10`);
  }
  
  console.log("Finished flooding jobs!");
}

flood().catch(console.error);

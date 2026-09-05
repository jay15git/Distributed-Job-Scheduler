const { PrismaClient, Role, Environment, ProjectStatus, QueueStatus, RetryStrategy, JobStatus, JobType, WorkerStatus } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clean DB
  await prisma.jobExecution.deleteMany({});
  await prisma.deadLetterQueue.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.organizationMember.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.workerHeartbeat.deleteMany({});
  await prisma.worker.deleteMany({});
  await prisma.auditLog.deleteMany({});

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create Users
  const user1 = await prisma.user.create({ data: { email: 'alice@acme.com', name: 'Alice Admin', passwordHash, isVerified: true } });
  const user2 = await prisma.user.create({ data: { email: 'bob@acme.com', name: 'Bob Dev', passwordHash, isVerified: true } });
  const user3 = await prisma.user.create({ data: { email: 'charlie@globex.com', name: 'Charlie CEO', passwordHash, isVerified: true } });

  // 2. Create Organizations
  const acme = await prisma.organization.create({ data: { name: 'Acme Corp', slug: 'acme' } });
  const globex = await prisma.organization.create({ data: { name: 'Globex Inc', slug: 'globex' } });

  // 3. Organization Memberships
  await prisma.organizationMember.createMany({
    data: [
      { userId: user1.id, organizationId: acme.id, role: 'ORG_ADMIN' },
      { userId: user2.id, organizationId: acme.id, role: 'DEVELOPER' },
      { userId: user3.id, organizationId: globex.id, role: 'ORG_ADMIN' },
    ],
  });

  // 4. Create Projects
  const projectA = await prisma.project.create({ data: { name: 'E-commerce Backend', organizationId: acme.id, createdBy: user1.id, environment: 'PRODUCTION' } });
  const projectB = await prisma.project.create({ data: { name: 'Data Pipeline', organizationId: acme.id, createdBy: user2.id, environment: 'DEVELOPMENT' } });
  const projectC = await prisma.project.create({ data: { name: 'Internal Tools', organizationId: globex.id, createdBy: user3.id, environment: 'PRODUCTION' } });

  // 5. Create Queues
  const emailQueue = await prisma.queue.create({ data: { name: 'email-sending', projectId: projectA.id, priority: 10, concurrencyLimit: 20, maxRetry: 5, retryStrategy: 'EXPONENTIAL_BACKOFF', status: 'RUNNING' } });
  const reportQueue = await prisma.queue.create({ data: { name: 'report-generation', projectId: projectB.id, priority: 5, concurrencyLimit: 2, maxRetry: 1, retryStrategy: 'FIXED_DELAY', status: 'RUNNING' } });

  // 6. Create Jobs
  await prisma.job.create({ data: { queueId: emailQueue.id, name: 'SendWelcomeEmail', payload: { userId: '123' }, type: 'IMMEDIATE', status: 'QUEUED', maxRetries: 3 } });
  await prisma.job.create({ data: { queueId: emailQueue.id, name: 'SendFollowupEmail', payload: { userId: '123' }, type: 'DELAYED', status: 'SCHEDULED', nextRunAt: new Date(Date.now() + 86400000), maxRetries: 3 } });
  await prisma.job.create({ data: { queueId: reportQueue.id, name: 'DailyRevenueReport', payload: { day: '2023-10-01' }, type: 'CRON', status: 'QUEUED', maxRetries: 1 } });
  const failedJob = await prisma.job.create({ data: { queueId: emailQueue.id, name: 'SendInvoice', payload: { invoiceId: 'INV-001' }, type: 'IMMEDIATE', status: 'FAILED', maxRetries: 3, retryCount: 3 } });

  // 7. DLQ Entry
  await prisma.deadLetterQueue.create({
    data: { jobId: failedJob.id, queueId: emailQueue.id, reason: 'Max retries exceeded', failureSummary: 'SMTP connection timeout' },
  });

  // 8. Worker Registration & Heartbeats
  const worker1 = await prisma.worker.create({ data: { id: 'worker-node-1', hostname: 'ip-10-0-0-1', region: 'us-east-1', os: 'linux', version: '1.0.0', status: 'ONLINE', tags: ['high-priority'] } });
  await prisma.workerHeartbeat.create({ data: { workerId: worker1.id, cpuUsage: 45.5, ramUsage: 1024.5, currentJobs: 5, runningThreads: 2, avgJobTimeMs: 120.5, failureRate: 0.01 } });

  // 9. Audit Logs
  await prisma.auditLog.create({
    data: { organizationId: acme.id, userId: user1.id, action: 'CREATE_QUEUE', resourceType: 'Queue', resourceId: emailQueue.id, details: { queueName: 'email-sending' } },
  });

  console.log('✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient, Role, Environment, ProjectStatus, QueueStatus, RetryStrategy, JobStatus, JobType, WorkerStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clean DB (children before parents to satisfy FKs)
  await prisma.jobExecution.deleteMany({});
  await prisma.jobExecutionHistory.deleteMany({});
  await prisma.jobDependency.deleteMany({});
  await prisma.deadLetterQueue.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.scheduledJob.deleteMany({});
  await prisma.queueMetric.deleteMany({});
  await prisma.queueConfiguration.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.apiKey.deleteMany({});
  await prisma.projectSetting.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.retryPolicy.deleteMany({});
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
      { userId: user1.id, organizationId: acme.id, role: Role.ORG_ADMIN },
      { userId: user2.id, organizationId: acme.id, role: Role.DEVELOPER },
      { userId: user3.id, organizationId: globex.id, role: Role.ORG_ADMIN },
    ],
  });

  // 4. Create Projects
  const projectA = await prisma.project.create({ data: { name: 'E-commerce Backend', organizationId: acme.id, createdBy: user1.id, environment: Environment.PRODUCTION } });
  const projectB = await prisma.project.create({ data: { name: 'Data Pipeline', organizationId: acme.id, createdBy: user2.id, environment: Environment.DEVELOPMENT } });
  const projectC = await prisma.project.create({ data: { name: 'Internal Tools', organizationId: globex.id, createdBy: user3.id, environment: Environment.PRODUCTION } });

  // 5. Retry Policies (attach so the retry pipeline is active in demo data)
  const standardPolicy = await prisma.retryPolicy.create({
    data: {
      name: 'standard-exponential',
      organizationId: acme.id,
      maxAttempts: 3,
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2.0,
      jitterEnabled: true,
      jitterPercentage: 0.1,
    },
  });
  const fastPolicy = await prisma.retryPolicy.create({
    data: {
      name: 'aggressive-fixed',
      organizationId: acme.id,
      maxAttempts: 5,
      strategy: RetryStrategy.FIXED_DELAY,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      jitterEnabled: false,
    },
  });

  // 6. Create Queues (with configuration + retry policy attached)
  const emailQueue = await prisma.queue.create({
    data: {
      name: 'email-sending',
      projectId: projectA.id,
      priority: 10,
      status: QueueStatus.ACTIVE,
      retryPolicyId: fastPolicy.id,
      configuration: { create: { concurrencyLimit: 5, maxExecutionTime: 30000, rateLimit: 100, rateLimitWindow: 1000 } },
    },
  });
  const reportQueue = await prisma.queue.create({
    data: {
      name: 'report-generation',
      projectId: projectB.id,
      priority: 5,
      status: QueueStatus.ACTIVE,
      retryPolicyId: standardPolicy.id,
      configuration: { create: { concurrencyLimit: 2, maxExecutionTime: 300000 } },
    },
  });

  // Project settings: default queue for cron-materialized jobs
  await prisma.projectSetting.create({
    data: { projectId: projectA.id, defaultQueueId: emailQueue.id, defaultRetryPolicyId: standardPolicy.id },
  });
  await prisma.projectSetting.create({
    data: { projectId: projectB.id, defaultQueueId: reportQueue.id, defaultRetryPolicyId: standardPolicy.id },
  });

  // 6. Create Jobs
  // Immediate Job (Email)
  await prisma.job.create({ data: { queueId: emailQueue.id, name: 'Send Welcome Email', payload: { taskType: 'email', to: 'alice@acme.com' }, type: JobType.IMMEDIATE, status: JobStatus.QUEUED, maxRetries: 3 } });
  
  // Delayed Job (Document)
  await prisma.job.create({ data: { queueId: reportQueue.id, name: 'Generate Monthly Invoice PDF', payload: { taskType: 'pdf', customerId: 'CUST-456' }, type: JobType.DELAYED, status: JobStatus.SCHEDULED, nextRunAt: new Date(Date.now() + 86400000), maxRetries: 3 } });

  // Cron Job (Data Processing)
  await prisma.job.create({ data: { queueId: reportQueue.id, name: 'Aggregate Daily Metrics', payload: { taskType: 'data_processing', dataset: 'daily_metrics' }, type: JobType.CRON, status: JobStatus.QUEUED, maxRetries: 1 } });

  // Failed Job (System)
  const failedJob = await prisma.job.create({ data: { queueId: emailQueue.id, name: 'Run Scheduled Database Backup', payload: { taskType: 'system', target: 's3://backups' }, type: JobType.IMMEDIATE, status: JobStatus.FAILED, maxRetries: 3, retryCount: 3 } });

  // 7. DLQ Entry
  await prisma.deadLetterQueue.create({
    data: { jobId: failedJob.id, queueId: emailQueue.id, reason: 'Max retries exceeded', failureSummary: 'SMTP connection timeout' },
  });

  // 8. Worker Registration & Heartbeats
  const worker1 = await prisma.worker.create({ data: { id: 'worker-node-1', hostname: 'ip-10-0-0-1', region: 'us-east-1', os: 'linux', version: '1.0.0', status: WorkerStatus.ONLINE, tags: ['high-priority'] } });
  
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

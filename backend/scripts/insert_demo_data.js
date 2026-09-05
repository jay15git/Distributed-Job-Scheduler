const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Inserting demo data...');
  const user1 = await prisma.user.findUnique({ where: { email: 'alice@acme.com' } });
  
  if (!user1) {
    console.error('Alice not found!');
    return;
  }

  let acme = await prisma.organization.findUnique({ where: { slug: 'acme' } });
  if (!acme) acme = await prisma.organization.create({ data: { name: 'Acme Corp', slug: 'acme' } });

  await prisma.organizationMember.createMany({
    data: [{ userId: user1.id, organizationId: acme.id, role: 'ORG_ADMIN' }],
    skipDuplicates: true
  });

  let projectA = await prisma.project.findFirst({ where: { name: 'E-commerce Backend' } });
  if (!projectA) projectA = await prisma.project.create({ data: { name: 'E-commerce Backend', organizationId: acme.id, createdBy: user1.id, environment: 'PRODUCTION' } });

  let retryPolicy = await prisma.retryPolicy.findFirst({ where: { name: 'Default Policy' } });
  if (!retryPolicy) retryPolicy = await prisma.retryPolicy.create({ data: { name: 'Default Policy', strategy: 'EXPONENTIAL_BACKOFF', maxAttempts: 5 } });

  let emailQueue = await prisma.queue.findFirst({ where: { name: 'email-sending', projectId: projectA.id } });
  if (!emailQueue) {
    emailQueue = await prisma.queue.create({ 
      data: { 
        name: 'email-sending', 
        projectId: projectA.id, 
        priority: 10, 
        status: 'ACTIVE',
        retryPolicyId: retryPolicy.id,
        configuration: {
          create: {
            concurrencyLimit: 20
          }
        }
      } 
    });
  }

  // Use valid JobStatus values. Probably: QUEUED, SCHEDULED, RUNNING, COMPLETED, FAILED, CANCELLED
  await prisma.job.create({ data: { queueId: emailQueue.id, name: 'ProcessPayment', payload: { paymentId: 'PAY-123' }, type: 'IMMEDIATE', status: 'RUNNING', maxRetries: 3 } });

  const worker = await prisma.worker.findUnique({ where: { id: 'worker-1' } });
  if (!worker) {
    await prisma.worker.create({
      data: {
        id: 'worker-1',
        hostname: 'worker-1.local',
        region: 'us-east-1',
        os: 'linux',
        version: '1.0.0',
        status: 'ONLINE',
        tags: ['default']
      }
    });
  }

  await prisma.workerHeartbeat.create({
    data: {
      workerId: 'worker-1',
      cpuUsage: 12.5,
      ramUsage: 256.0,
      currentJobs: 2,
      runningThreads: 4,
      avgJobTimeMs: 45.0,
      failureRate: 0.0,
    }
  });

  console.log('✅ Demo data inserted.');
}

main().catch(console.error).finally(() => prisma.$disconnect());

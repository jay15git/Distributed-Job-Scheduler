import { prisma } from './config/prisma';

import { JobRepository } from './repositories/job.repository';
import { WorkerService } from './services/worker.service';
import { JobStateMachineEngine } from './services/job-state-machine.engine';
import { RetryEngine } from './services/retry.engine';
import { DependencyEngine } from './services/dependency.engine';
import { RetryPolicyService } from './services/retry-policy.service';
import { RetryPolicyRepository } from './repositories/retry-policy.repository';
import { ExecutorRegistry, EmailExecutor, PdfExecutor, WebhookExecutor, CustomExecutor, ImmediateExecutor, DataProcessingExecutor, SystemExecutor } from './services/executor.registry';
import { logger } from './config/logger';
import os from 'os';

export const startWorker = async () => {
  const workerId = `worker-${os.hostname()}-${Math.random().toString(36).substr(2, 9)}`;
  const repo = new JobRepository(prisma);
  const stateMachine = new JobStateMachineEngine(repo);
  const retryEngine = new RetryEngine(
    prisma,
    stateMachine,
    new RetryPolicyService(new RetryPolicyRepository(prisma))
  );

  const registry = new ExecutorRegistry();
  registry.register(new EmailExecutor());
  registry.register(new PdfExecutor());
  registry.register(new WebhookExecutor());
  registry.register(new DataProcessingExecutor());
  registry.register(new SystemExecutor());
  registry.register(new CustomExecutor());
  registry.register(new ImmediateExecutor());
  const dependencyEngine = new DependencyEngine(prisma, stateMachine);
  const worker = new WorkerService(prisma, stateMachine, registry, workerId, retryEngine, dependencyEngine);

  await worker.registerWorker({
    hostname: os.hostname(),
    pid: process.pid,
    capabilities: {},
    maxConcurrency: 10,
    supportedQueues: [], // empty = all queues
    supportedJobTypes: ['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'CRON'],
  });

  logger.info(`Worker ${workerId} started successfully.`);
  await worker.startPolling();
};

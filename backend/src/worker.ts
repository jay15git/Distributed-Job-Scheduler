import { prisma } from './config/prisma';

import { JobRepository } from './repositories/job.repository';
import { WorkerService } from './services/worker.service';
import { JobStateMachineEngine } from './services/job-state-machine.engine';
import { ExecutorRegistry, EmailExecutor, PdfExecutor, WebhookExecutor, CustomExecutor, ImmediateExecutor, DataProcessingExecutor, SystemExecutor } from './services/executor.registry';
import { logger } from './config/logger';

export const startWorker = async () => {
  const workerId = `worker-${Math.random().toString(36).substr(2, 9)}`;
  const repo = new JobRepository(prisma);
  const stateMachine = new JobStateMachineEngine(repo);
  
  const registry = new ExecutorRegistry();
  registry.register(new EmailExecutor());
  registry.register(new PdfExecutor());
  registry.register(new WebhookExecutor());
  registry.register(new DataProcessingExecutor());
  registry.register(new SystemExecutor());
  registry.register(new CustomExecutor());
  registry.register(new ImmediateExecutor());
  const worker = new WorkerService(prisma, stateMachine, registry, workerId);

  await worker.registerWorker({
    hostname: 'local-worker',
    pid: process.pid,
    capabilities: {},
    maxConcurrency: 10,
    supportedQueues: ['djs_workers'],
    supportedJobTypes: ['IMMEDIATE', 'SCHEDULED'],
  });

  logger.info(`Worker ${workerId} started successfully.`);
  await worker.startPolling();
};

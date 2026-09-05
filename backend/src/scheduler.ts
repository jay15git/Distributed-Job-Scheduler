import { prisma } from './config/prisma';
import { SchedulerEngine } from './services/scheduler.engine';
import { JobStateMachineEngine } from './services/job-state-machine.engine';
import { JobRepository } from './repositories/job.repository';
import { logger } from './config/logger';

export const startScheduler = async () => {
  const repo = new JobRepository(prisma);
  const stateMachine = new JobStateMachineEngine(repo);
  const scheduler = new SchedulerEngine(prisma, stateMachine);

  // Poll loop for scheduled jobs
  const poll = async () => {
    try {
      await scheduler.processScheduledJobs();
    } catch (err) {
      logger.error({ err }, 'Error in scheduler loop:');
    }
    setTimeout(poll, 5000);
  };

  poll();

  logger.info(`Scheduler loop started successfully.`);
};

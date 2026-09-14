import { prisma } from './config/prisma';
import { SchedulerEngine } from './services/scheduler.engine';
import { JobStateMachineEngine } from './services/job-state-machine.engine';
import { JobRepository } from './repositories/job.repository';
import { RetryEngine } from './services/retry.engine';
import { RetryPolicyService } from './services/retry-policy.service';
import { RetryPolicyRepository } from './repositories/retry-policy.repository';
import { RecoveryEngine } from './services/recovery.engine';
import { DependencyEngine } from './services/dependency.engine';
import { QueueMetricsService } from './services/queue-metrics.service';
import { QueueMetricsRepository } from './repositories/queue-metrics.repository';
import { LeaderElector } from './services/leader-elector.service';
import { logger } from './config/logger';
import * as metrics from './config/metrics';

/**
 * Self-rescheduling loop: the next tick is only queued after the current one
 * finishes, so a slow pass can never stack up overlapping invocations.
 * When `gate` is supplied (leader election), the tick only runs while the
 * gate returns true — followers keep cheaply renewing their candidacy.
 */
const loop = (fn: () => Promise<unknown>, intervalMs: number, label: string, gate?: () => Promise<boolean>) => {
  const tick = async () => {
    const start = Date.now();
    try {
      if (!gate || (await gate())) {
        await fn();
        metrics.schedulerTicksTotal.inc();
        metrics.schedulerTickDurationSeconds.observe((Date.now() - start) / 1000);
      }
    } catch (err) {
      logger.error({ err }, `Error in ${label}`);
    }
    setTimeout(tick, intervalMs);
  };
  tick();
};

export const startScheduler = async () => {
  const repo = new JobRepository(prisma);
  const stateMachine = new JobStateMachineEngine(repo);
  const scheduler = new SchedulerEngine(prisma, stateMachine);

  const retryEngine = new RetryEngine(
    prisma,
    stateMachine,
    new RetryPolicyService(new RetryPolicyRepository(prisma))
  );

  const recovery = new RecoveryEngine(
    prisma,
    stateMachine,
    new QueueMetricsService(new QueueMetricsRepository(prisma)),
    retryEngine,
    new DependencyEngine(prisma, stateMachine)
  );

  // One leader per cluster does the scans; SKIP LOCKED keeps correctness
  // even during a leadership flap or split-brain window.
  const elector = new LeaderElector(prisma);
  const lead = () => elector.tryLead();

  // Due-job promoter: SCHEDULED + RETRY_WAITING -> QUEUED (+ stream notify)
  loop(() => scheduler.processScheduledJobs(), 5_000, 'due-job-promoter', lead);

  // Cron materializer: ScheduledJob cronExpression -> real Job rows
  loop(() => scheduler.processCronSchedules(), 10_000, 'cron-materializer', lead);

  // SLA recovery: claim timeouts, heartbeat timeouts, unevaluated failures,
  // stale worker detection
  loop(() => recovery.executeFastSweep(), 5_000, 'fast-sweeper', lead);

  // Drift repair, metrics/heartbeat pruning, retention archival
  loop(() => recovery.executeSlowSweep(), 5 * 60_000, 'slow-sweeper', lead);

  logger.info(`Scheduler loops started successfully.`);
};

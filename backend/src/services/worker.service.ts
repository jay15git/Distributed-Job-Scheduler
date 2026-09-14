import { JobStatus, QueueStatus, WorkerStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';
import { JobRepository } from '../repositories/job.repository';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { ExecutorRegistry } from './executor.registry';
import { RetryEngine } from './retry.engine';
import { DependencyEngine } from './dependency.engine';
import { redis } from '../config/redis';
import { contextStorage, RequestContext } from '../config/context';
import { logger } from '../config/logger';
import * as metrics from '../config/metrics';

export class WorkerService {
  private workerId: string;
  private isDraining: boolean = false;
  private activeJobs: number = 0;
  private workerHeartbeatInterval?: NodeJS.Timeout;
  private maxConcurrency: number = 10;
  private supportedQueues: string[] = [];
  private jobsCompleted: number = 0;
  private jobsFailed: number = 0;
  private recentDurations: number[] = [];
  /** In-flight job count per queue — enforces QueueConfiguration.concurrencyLimit. */
  private activeJobsByQueue: Map<string, number> = new Map();
  /**
   * Queues whose slot just freed (a job finished). Drained at the top of the
   * next poll tick so a concurrency-capped queue keeps pulling its backlog
   * instead of waiting for a fresh stream entry or the drift sweeper.
   */
  private freedQueues: Set<string> = new Set();
  /** Per-queue config snapshot, refreshed each poll tick. */
  private queueConfigCache: Map<string, {
    concurrencyLimit: number;
    heartbeatInterval: number;
    maxExecutionTime: number;
  }> = new Map();
  /** Pending stream entries idle longer than this are reclaimed via XAUTOCLAIM. */
  public reclaimIdleMs: number = 30000;

  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine,
    private readonly registry: ExecutorRegistry,
    workerId: string,
    private readonly retryEngine?: RetryEngine,
    private readonly dependencyEngine?: DependencyEngine
  ) {
    this.workerId = workerId;
  }

  /**
   * 5A: Worker Registration
   */
  async registerWorker(config: {
    hostname: string;
    pid: number;
    capabilities: any;
    maxConcurrency: number;
    supportedQueues: string[];
    supportedJobTypes: string[];
    region?: string;
    version?: string;
  }) {
    this.maxConcurrency = config.maxConcurrency;
    // Empty list = subscribe to every queue. Non-empty = queue *names* this worker serves.
    this.supportedQueues = config.supportedQueues;
    await this.db.worker.upsert({
      where: { id: this.workerId },
      update: {
        status: WorkerStatus.ONLINE,
        lastSeen: new Date(),
        pid: config.pid,
        capabilities: config.capabilities,
        maxConcurrency: config.maxConcurrency,
        supportedQueues: config.supportedQueues,
        supportedJobTypes: config.supportedJobTypes,
        region: config.region,
        version: config.version,
      },
      create: {
        id: this.workerId,
        hostname: config.hostname,
        status: WorkerStatus.ONLINE,
        pid: config.pid,
        capabilities: config.capabilities,
        maxConcurrency: config.maxConcurrency,
        supportedQueues: config.supportedQueues,
        supportedJobTypes: config.supportedJobTypes,
        region: config.region,
        version: config.version,
      }
    });

    metrics.workersOnline.inc();
    this.startWorkerHeartbeat();
    this.setupGracefulShutdown();
  }

  /**
   * 5B & 5C: Job Claiming and Execution
   */
  async startPolling() {
    const groupName = 'djs_workers';

    while (!this.isDraining) {
      try {
        // Only consume queues that want consumption: ACTIVE accepts work,
        // DRAINING finishes its backlog but rejects new enqueues.
        // PAUSED / DISABLED / ARCHIVED queues are never polled.
        const queues = await this.db.queue.findMany({
          where: {
            status: { in: [QueueStatus.ACTIVE, QueueStatus.DRAINING] },
            ...(this.supportedQueues.length > 0
              ? { name: { in: this.supportedQueues } }
              : {}),
          },
          select: {
            id: true,
            configuration: {
              select: {
                concurrencyLimit: true,
                heartbeatInterval: true,
                maxExecutionTime: true,
              },
            },
          },
        });
        const queueIds = queues.map(q => q.id);
        this.queueConfigCache = new Map(
          queues.map(q => [q.id, {
            concurrencyLimit: q.configuration?.concurrencyLimit ?? 10,
            heartbeatInterval: q.configuration?.heartbeatInterval ?? 10000,
            maxExecutionTime: q.configuration?.maxExecutionTime ?? 300000,
          }])
        );
        
        if (queueIds.length === 0) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        for (const qId of queueIds) {
          const streamKey = `queue:${qId}`;
          try {
            await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
          } catch (err: any) {
            if (!err.message.includes('BUSYGROUP')) {
              logger.error({ err }, 'Error creating consumer group');
            }
          }
        }

        await this.pollOnce(queueIds);
      } catch (err) {
        logger.error({ err }, 'Error polling worker:');
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  async pollOnce(queueIds: string[], timeoutMs: number = 2000) {
    if (this.activeJobs >= this.maxConcurrency) {
      await new Promise(r => setTimeout(r, 1000));
      return [];
    }

    // Lazily hydrate config for queues the startPolling refresh hasn't seen
    // yet (tests and first-tick callers can hand pollOnce a bare id list).
    const missing = queueIds.filter(id => !this.queueConfigCache.has(id));
    if (missing.length > 0) {
      const configs = await this.db.queue.findMany({
        where: { id: { in: missing } },
        select: {
          id: true,
          configuration: {
            select: {
              concurrencyLimit: true,
              heartbeatInterval: true,
              maxExecutionTime: true,
            },
          },
        },
      });
      for (const q of configs) {
        this.queueConfigCache.set(q.id, {
          concurrencyLimit: q.configuration?.concurrencyLimit ?? 10,
          heartbeatInterval: q.configuration?.heartbeatInterval ?? 10000,
          maxExecutionTime: q.configuration?.maxExecutionTime ?? 300000,
        });
      }
    }

    const groupName = 'djs_workers';
    const claimedJobs: any[] = [];

    // Drain queues that freed a slot since the last tick: their backlog stays
    // QUEUED because the saturated wake-up was consumed without a claim.
    for (const queueId of Array.from(this.freedQueues)) {
      this.freedQueues.delete(queueId);
      // Skip queues that fell out of the served set between ticks (PAUSED /
      // DISABLED / filtered out) — they must not be claimed from.
      if (!queueIds.includes(queueId)) continue;
      await this.tryClaimAndRun(queueId, groupName, claimedJobs, null);
      if (this.activeJobs >= this.maxConcurrency) return claimedJobs;
    }

    // Reclaim stream entries abandoned by crashed consumers (pending > 30s).
    // A stale entry is only a wake-up signal — the DB claim below decides
    // whether work actually remains, so duplicates are harmless.
    for (const queueId of queueIds) {
      const streamKey = `queue:${queueId}`;
      try {
        const [, entries] = (await redis.xautoclaim(
          streamKey, groupName, this.workerId,
          this.reclaimIdleMs, '0-0', 'COUNT', 10
        )) as [string, [string, string[]][], string[]];
        for (const [msgId] of entries) {
          await this.handleStreamMessage(streamKey, queueId, msgId, groupName, claimedJobs);
          if (this.activeJobs >= this.maxConcurrency) return claimedJobs;
        }
      } catch (err: any) {
        logger.error({ err, streamKey }, 'XAUTOCLAIM failed');
      }
    }

    const streamKeys = queueIds.map(id => `queue:${id}`);
    const ids = queueIds.map(() => '>');

    const startTime = Date.now();
    const response = await redis.xreadgroup(
      'GROUP', groupName, this.workerId,
      'COUNT', 1,
      'BLOCK', timeoutMs,
      'STREAMS', ...streamKeys, ...ids
    );

    if (!response || response.length === 0) {
      return claimedJobs;
    }

    const duration = (Date.now() - startTime) / 1000;
    metrics.workerClaimLatencySeconds.observe({ worker_id: this.workerId, queue: 'multi' }, duration);

    // response is an array of [streamKey, messages]
    for (const streamResponse of (response as any[])) {
      const streamKey = streamResponse[0];
      const queueId = streamKey.replace('queue:', '');

      for (const msg of streamResponse[1]) {
        await this.handleStreamMessage(streamKey, queueId, msg[0], groupName, claimedJobs);
        if (this.activeJobs >= this.maxConcurrency) return claimedJobs;
      }
    }

    return claimedJobs;
  }

  /**
   * A stream entry is a wake-up signal, not a job assignment: the worker then
   * runs the authoritative SKIP LOCKED claim, which picks the highest-priority
   * QUEUED job. Acks the entry either way — re-delivery is never needed because
   * the claim query (not the stream) is the work source.
   */
  private async handleStreamMessage(
    streamKey: string,
    queueId: string,
    msgId: string,
    groupName: string,
    claimedJobs: any[]
  ) {
    try {
      // The entry is a wake-up signal only: ack it regardless of outcome —
      // re-delivery is never needed because the claim query (not the stream)
      // is the work source.
      await this.tryClaimAndRun(queueId, groupName, claimedJobs, msgId);
      await redis.xack(streamKey, groupName, msgId);
    } catch (e: any) {
      logger.error({ err: e }, 'Claim attempt failed');
      await redis.xack(streamKey, groupName, msgId);
    }
  }

  /**
   * Enforces the per-queue concurrency cap, then runs the authoritative
   * SKIP LOCKED claim and dispatches execution. Used both by stream
   * wake-ups (msgId present) and by freedQueues slot drains (msgId null).
   */
  private async tryClaimAndRun(
    queueId: string,
    groupName: string,
    claimedJobs: any[],
    msgId: string | null
  ) {
    const cfg = this.queueConfigCache.get(queueId);
    const activeInQueue = this.activeJobsByQueue.get(queueId) ?? 0;
    if (cfg && cfg.concurrencyLimit > 0 && activeInQueue >= cfg.concurrencyLimit) {
      metrics.queueConcurrencySaturatedTotal.inc({ queue_id: queueId });
      return;
    }

    const repo = new JobRepository(this.db);
    const claimed = await repo.claimNextQueuedJob(queueId, this.workerId);
    if (!claimed) return; // queue drained or job already taken

    await this.db.jobExecutionHistory.create({
      data: {
        jobId: claimed.id,
        previousState: JobStatus.QUEUED,
        newState: JobStatus.CLAIMED,
        actor: `worker:${this.workerId}`,
        reason: 'Claimed via SKIP LOCKED',
      },
    });

    this.activeJobs++;
    this.activeJobsByQueue.set(queueId, activeInQueue + 1);
    metrics.workerUtilization.set({ worker_id: this.workerId }, this.activeJobs / this.maxConcurrency);
    metrics.workerJobsClaimedTotal.inc({ worker_id: this.workerId, queue: queueId });

    this.executeJob(claimed.id, msgId, `queue:${queueId}`, groupName).catch(console.error);
    claimedJobs.push({ id: claimed.id, msgId });
  }

  private async executeJob(jobId: string, msgId: string | null, streamKey: string, groupName: string) {
    let jobHeartbeatInterval: NodeJS.Timeout | undefined;
    let executionId: string | undefined;
    let queueIdForMetrics = 'unknown';
    let jobTypeForMetrics = 'unknown';
    // Set when the job heartbeat observes CANCELLING: the late executor
    // result is discarded instead of transitioning the job back to life.
    let cancelObserved = false;

    try {
      const job = await this.db.job.findUnique({ where: { id: jobId }});
      if (!job) throw new Error('Job not found');
      queueIdForMetrics = job.queueId;
      jobTypeForMetrics = job.type;
      const queueCfg = this.queueConfigCache.get(job.queueId);

      // transitionJobState(CLAIMED -> RUNNING)
      await this.stateMachine.transitionJobState({
        jobId,
        expectedState: JobStatus.CLAIMED,
        nextState: JobStatus.RUNNING,
        actor: `worker:${this.workerId}`,
        reason: 'Execution started',
      });

      // Record the attempt (drives per-job execution timeline in the API/UI)
      const execution = await this.db.jobExecution.create({
        data: {
          jobId,
          workerId: this.workerId,
          status: JobStatus.RUNNING,
          startedAt: new Date(),
          retryAttempt: job.retryCount,
        },
      });
      executionId = execution.id;

      const context: RequestContext = {
        requestId: `req-${Date.now()}`,
        correlationId: job.correlationId || `corr-${Date.now()}`,
        jobId: job.id,
        queueId: job.queueId,
        workerId: this.workerId,
      };

      await contextStorage.run(context, async () => {
        // Job heartbeat at the queue's configured interval — the sweeper
        // reaps RUNNING jobs whose heartbeat goes stale.
        const heartbeatMs = queueCfg?.heartbeatInterval ?? 10000;
        jobHeartbeatInterval = setInterval(async () => {
          try {
            const current = await this.db.job.findUnique({
              where: { id: jobId },
              select: { status: true },
            });
            if (current?.status === JobStatus.CANCELLING) {
              // Cooperative cancel: the worker owns the CANCELLING -> CANCELLED
              // transition. An executor still in flight is abandoned; its late
              // result is discarded below via cancelObserved.
              cancelObserved = true;
              await this.stateMachine.transitionJobState({
                jobId,
                expectedState: JobStatus.CANCELLING,
                nextState: JobStatus.CANCELLED,
                actor: `worker:${this.workerId}`,
                reason: 'Cancellation observed during execution',
              }).catch(() => {});
              if (executionId) {
                await this.db.jobExecution.update({
                  where: { id: executionId },
                  data: { status: JobStatus.CANCELLED, completedAt: new Date() },
                }).catch(() => {});
              }
              return;
            }
            await this.db.job.update({
              where: { id: jobId },
              data: { lastHeartbeat: new Date() }
            });
          } catch {}
        }, heartbeatMs);

        // Execute via Registry (5C)
        const payload = job.payload as any;
        const taskType = payload?.taskType || job.type;
        const executor = this.registry.get(taskType as string);

        const startTime = Date.now();
        // Race the executor against the queue's maxExecutionTime. Node can't
        // kill in-flight executor code, so a timeout flags the job FAILED and
        // the late result is dropped on the floor (same model as cooperative
        // cancel).
        const maxExecMs = queueCfg?.maxExecutionTime ?? 300000;
        const execPromise = executor.execute(job.payload);
        execPromise.catch(() => {}); // swallow late results/rejections after timeout
        let execTimer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          execTimer = setTimeout(() => {
            const e: any = new Error(`Execution exceeded maxExecutionTime (${maxExecMs}ms)`);
            e.errorCode = 'EXEC_TIMEOUT';
            reject(e);
          }, maxExecMs);
        });
        let output: any;
        try {
          output = await Promise.race([execPromise, timeoutPromise]);
        } finally {
          if (execTimer) clearTimeout(execTimer);
        }
        const duration = Date.now() - startTime;

        // Cooperative cancel: if the heartbeat already moved the job to
        // CANCELLED, the result is discarded — never resurrect a cancelled job.
        if (!cancelObserved) {
          this.jobsCompleted++;
          this.recentDurations.push(duration);
          if (this.recentDurations.length > 100) this.recentDurations.shift();

          // Log success natively
          logger.info({ result: 'COMPLETED', duration }, 'Job execution completed');
          metrics.workerJobsCompletedTotal.inc({ worker_id: this.workerId, queue: job.queueId, job_type: job.type });
          metrics.workerExecutionDurationSeconds.observe(
            { worker_id: this.workerId, queue: job.queueId, job_type: job.type },
            duration / 1000
          );

          // transitionJobState(RUNNING -> COMPLETED). If an operator cancelled
          // the job mid-flight this transition fails and CANCELLED wins.
          await this.stateMachine.transitionJobState({
            jobId,
            expectedState: JobStatus.RUNNING,
            nextState: JobStatus.COMPLETED,
            actor: `worker:${this.workerId}`,
            reason: 'Execution successful',
          });

          await this.db.jobExecution.update({
            where: { id: execution.id },
            data: {
              status: JobStatus.COMPLETED,
              completedAt: new Date(),
              durationMs: duration,
              output: output === undefined ? undefined : (output as any),
            },
          }).catch(e => logger.error({ err: e }, 'Failed to record job execution result'));

          // Release DAG children whose parents are now all COMPLETED.
          if (this.dependencyEngine) {
            await this.dependencyEngine.releaseDependents(jobId)
              .catch(e => logger.error({ err: e }, 'Dependency release failed'));
          }
        }
      });

    } catch (error: any) {
      // 5D: Failure -> transition, record the attempt, then let RetryEngine decide
      const context: RequestContext = {
        requestId: `req-${Date.now()}`,
        correlationId: `corr-${Date.now()}`, // Fallback if job failed to load
        jobId,
        workerId: this.workerId,
      };

      await contextStorage.run(context, async () => {
        const errorCode = error.errorCode || 'EXEC_ERROR';
        this.jobsFailed++;
        logger.error({ errorCode, errorMsg: error.message }, 'Job execution failed');
        metrics.workerJobsFailedTotal.inc({ worker_id: this.workerId, queue: queueIdForMetrics, job_type: jobTypeForMetrics, error_code: errorCode });
        if (errorCode === 'EXEC_TIMEOUT') {
          metrics.jobExecutionTimeoutsTotal.inc({ queue_id: queueIdForMetrics });
        }

        try {
          await this.stateMachine.transitionJobState({
            jobId,
            expectedState: JobStatus.RUNNING,
            nextState: JobStatus.FAILED,
            actor: `worker:${this.workerId}`,
            reason: error.message,
          });
        } catch (transitionErr: any) {
          // Job may never have reached RUNNING (e.g. CLAIMED -> RUNNING raced
          // a reaper) or an operator cancel won the race (CANCELLING landed
          // before our COMPLETED/FAILED). Finish a pending cancel; anything
          // else is left to the sweeper.
          const current = await this.db.job.findUnique({
            where: { id: jobId },
            select: { status: true },
          }).catch(() => null);
          if (current?.status === JobStatus.CANCELLING) {
            await this.stateMachine.transitionJobState({
              jobId,
              expectedState: JobStatus.CANCELLING,
              nextState: JobStatus.CANCELLED,
              actor: `worker:${this.workerId}`,
              reason: 'Cancellation completed by worker',
            }).catch(e => logger.error({ err: e }, 'CANCELLED transition failed'));
          } else {
            logger.error({ err: transitionErr }, 'FAILED transition rejected; leaving job to sweeper');
          }
          return;
        }

        if (executionId) {
          await this.db.jobExecution.update({
            where: { id: executionId },
            data: {
              status: JobStatus.FAILED,
              completedAt: new Date(),
              error: { message: error.message, code: errorCode },
              stackTrace: error.stack,
            },
          }).catch(e => logger.error({ err: e }, 'Failed to record job execution error'));
        }

        // Hand the FAILED job to the retry pipeline: backoff -> RETRY_WAITING
        // or -> DLQ. If no engine is wired (tests), the sweeper's FAILED pass
        // evaluates it later — this call is belt-and-suspenders, not the only path.
        if (this.retryEngine) {
          await this.retryEngine.evaluateFailedJob(jobId, errorCode, error.message)
            .catch(e => logger.error({ err: e }, 'RetryEngine evaluation failed; sweeper will retry'));
        }
      });
    } finally {
      if (jobHeartbeatInterval) {
        clearInterval(jobHeartbeatInterval);
      }
      this.activeJobs--;
      this.activeJobsByQueue.set(
        queueIdForMetrics,
        Math.max(0, (this.activeJobsByQueue.get(queueIdForMetrics) ?? 1) - 1)
      );
      // The slot this job held is free — flag the queue so the next poll tick
      // re-claims its backlog immediately instead of waiting for a stream
      // wake-up or the drift sweeper.
      if (queueIdForMetrics !== 'unknown') {
        this.freedQueues.add(queueIdForMetrics);
      }
      metrics.workerUtilization.set({ worker_id: this.workerId }, this.activeJobs / this.maxConcurrency);
      // Discard from Redis (freed-queue claims carry no stream entry to ack)
      if (msgId !== null) {
        await redis.xack(streamKey, groupName, msgId);
      }
    }
  }

  /**
   * 5E: Worker Heartbeat
   */
  private startWorkerHeartbeat() {
    this.workerHeartbeatInterval = setInterval(async () => {
      if (this.isDraining) return;

      const total = this.jobsCompleted + this.jobsFailed;
      const avgJobTimeMs = this.recentDurations.length
        ? this.recentDurations.reduce((a, b) => a + b, 0) / this.recentDurations.length
        : 0;

      await this.db.workerHeartbeat.create({
        data: {
          workerId: this.workerId,
          cpuUsage: process.cpuUsage().user / 1000000,
          ramUsage: process.memoryUsage().heapUsed / 1024 / 1024,
          currentJobs: this.activeJobs,
          runningThreads: 1, // Node is single threaded mostly
          avgJobTimeMs,
          failureRate: total > 0 ? this.jobsFailed / total : 0,
        }
      });

      await this.db.worker.update({
        where: { id: this.workerId },
        data: { lastSeen: new Date() }
      });
      metrics.workerHeartbeatTotal.inc({ worker_id: this.workerId });
    }, 10000);
  }

  /**
   * Graceful Shutdown
   */
  private setupGracefulShutdown() {
    const shutdown = async () => {
      console.log('SIGTERM received. Starting graceful shutdown...');
      this.isDraining = true;

      // 1. Update Status
      await this.db.worker.update({
        where: { id: this.workerId },
        data: { status: WorkerStatus.DRAINING }
      });

      // 2. Stop Heartbeat
      if (this.workerHeartbeatInterval) {
        clearInterval(this.workerHeartbeatInterval);
      }

      // 3. Wait for active jobs to finish
      while (this.activeJobs > 0) {
        console.log(`Waiting for ${this.activeJobs} jobs to finish...`);
        await new Promise(r => setTimeout(r, 1000));
      }

      // 4. Update Status to OFFLINE
      await this.db.worker.update({
        where: { id: this.workerId },
        data: { status: WorkerStatus.OFFLINE }
      });

      metrics.workersOnline.dec();
      console.log('Worker gracefully shut down.');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }


}

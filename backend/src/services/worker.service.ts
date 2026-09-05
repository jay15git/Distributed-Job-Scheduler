import { JobStatus, WorkerStatus } from '@prisma/client';
import { TransactionClient } from '../database/db';
import { JobStateMachineEngine } from './job-state-machine.engine';
import { ExecutorRegistry } from './executor.registry';
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

  constructor(
    private readonly db: TransactionClient,
    private readonly stateMachine: JobStateMachineEngine,
    private readonly registry: ExecutorRegistry,
    workerId: string
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
        const queues = await this.db.queue.findMany({ select: { id: true } });
        const queueIds = queues.map(q => q.id);
        
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
    if (this.activeJobs >= 10) { // Assume maxConcurrency is 10 for this loop
      await new Promise(r => setTimeout(r, 1000));
      return [];
    }

      const streamKeys = queueIds.map(id => `queue:${id}`);
      const groupName = 'djs_workers';
      const ids = queueIds.map(() => '>');
      
      const startTime = Date.now();
      const response = await redis.xreadgroup(
        'GROUP', groupName, this.workerId,
        'COUNT', 1,
        'BLOCK', timeoutMs,
        'STREAMS', ...streamKeys, ...ids
      );
      
      if (!response || response.length === 0) {
        return [];
      }

      const duration = (Date.now() - startTime) / 1000;
      metrics.workerClaimLatencySeconds.observe({ worker_id: this.workerId, queue: 'multi' }, duration);

    const claimedJobs: any[] = [];
    
    // response is an array of [streamKey, messages]
    for (const streamResponse of (response as any[])) {
      const streamKey = streamResponse[0];
      const queueId = streamKey.replace('queue:', '');
      const messages = streamResponse[1];

      for (const msg of messages) {
        const msgId = msg[0];
      const kv = msg[1];
      const jobId = kv[1]; // assuming ['jobId', 'uuid']

      try {
        // 3. transitionJobState(QUEUED -> CLAIMED)
        await this.stateMachine.transitionJobState({
          jobId,
          expectedState: JobStatus.QUEUED,
          nextState: JobStatus.CLAIMED,
          actor: `worker:${this.workerId}`,
          reason: 'Claimed from Redis Stream',
          lockedBy: this.workerId
        });

        // 4. If Success -> Execute
        this.activeJobs++;
        metrics.workerUtilization.set({ worker_id: this.workerId }, this.activeJobs / this.maxConcurrency);
        metrics.workerJobsClaimedTotal.inc({ worker_id: this.workerId, queue: queueId });
        
        this.executeJob(jobId, msgId, streamKey, groupName).catch(console.error);
        
        claimedJobs.push({ id: jobId, msgId });
      } catch (e: any) {
        // If transition fails (e.g. Sweeper already claimed it or another worker got it), 
        // discard the message safely.
        console.error('Transition failed:', e.message);
        await redis.xack(streamKey, groupName, msgId);
      }
    }
    }
    
    return claimedJobs;
  }

  private async executeJob(jobId: string, msgId: string, streamKey: string, groupName: string) {
    let jobHeartbeatInterval: NodeJS.Timeout | undefined;

    try {
      const job = await this.db.job.findUnique({ where: { id: jobId }});
      if (!job) throw new Error('Job not found');

      // transitionJobState(CLAIMED -> RUNNING)
      await this.stateMachine.transitionJobState({
        jobId,
        expectedState: JobStatus.CLAIMED,
        nextState: JobStatus.RUNNING,
        actor: `worker:${this.workerId}`,
        reason: 'Execution started',
      });

      const context: RequestContext = {
        requestId: `req-${Date.now()}`,
        correlationId: job.correlationId || `corr-${Date.now()}`,
        jobId: job.id,
        queueId: job.queueId,
        workerId: this.workerId,
      };

      await contextStorage.run(context, async () => {
        // Start Job-specific Heartbeat (5E)
        jobHeartbeatInterval = setInterval(async () => {
          await this.db.job.update({
            where: { id: jobId },
            data: { lastHeartbeat: new Date() }
          }).catch(() => {});
        }, 5000);

        // Execute via Registry (5C)
        const payload = job.payload as any;
        const taskType = payload?.taskType || job.type;
        const executor = this.registry.get(taskType as string);
        
        const startTime = Date.now();
        await executor.execute(job.payload);
        const duration = Date.now() - startTime;

        // Log success natively
        logger.info({ result: 'COMPLETED', duration }, 'Job execution completed');
        metrics.workerJobsCompletedTotal.inc({ worker_id: this.workerId, queue: job.queueId, job_type: job.type });
        metrics.workerExecutionDurationSeconds.observe(
          { worker_id: this.workerId, queue: job.queueId, job_type: job.type },
          duration / 1000
        );

        // transitionJobState(RUNNING -> COMPLETED)
        await this.stateMachine.transitionJobState({
          jobId,
          expectedState: JobStatus.RUNNING,
          nextState: JobStatus.COMPLETED,
          actor: `worker:${this.workerId}`,
          reason: 'Execution successful',
        });
      });

    } catch (error: any) {
      // 5D: Failure -> Orchestrator handles Retry/DLQ
      // transitionJobState(RUNNING -> FAILED)
      const context: RequestContext = {
        requestId: `req-${Date.now()}`,
        correlationId: `corr-${Date.now()}`, // Fallback if job failed to load
        jobId,
        workerId: this.workerId,
      };

      await contextStorage.run(context, async () => {
        logger.error({ errorCode: 'EXEC_ERROR', errorMsg: error.message }, 'Job execution failed');
        metrics.workerJobsFailedTotal.inc({ worker_id: this.workerId, queue: 'unknown', job_type: 'unknown', error_code: 'EXEC_ERROR' });

        await this.stateMachine.transitionJobState({
          jobId,
          expectedState: JobStatus.RUNNING,
          nextState: JobStatus.FAILED,
          actor: `worker:${this.workerId}`,
          reason: error.message,
        });
      });
    } finally {
      if (jobHeartbeatInterval) {
        clearInterval(jobHeartbeatInterval);
      }
      this.activeJobs--;
      metrics.workerUtilization.set({ worker_id: this.workerId }, this.activeJobs / this.maxConcurrency);
      // Discard from Redis
      await redis.xack(streamKey, groupName, msgId);
    }
  }

  /**
   * 5E: Worker Heartbeat
   */
  private startWorkerHeartbeat() {
    this.workerHeartbeatInterval = setInterval(async () => {
      if (this.isDraining) return;

      await this.db.workerHeartbeat.create({
        data: {
          workerId: this.workerId,
          cpuUsage: process.cpuUsage().user / 1000000,
          ramUsage: process.memoryUsage().heapUsed / 1024 / 1024,
          currentJobs: this.activeJobs,
          runningThreads: 1, // Node is single threaded mostly
          avgJobTimeMs: 0,
          failureRate: 0,
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

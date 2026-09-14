import { Request, Response } from 'express';
import { Prisma, QueueStatus, JobStatus } from '@prisma/client';
import { prisma as db } from '../database/db';
import { redis } from '../config/redis';
import { getContext } from '../config/context';
import * as metrics from '../config/metrics';

export class JobController {
  /**
   * Enqueue semantics:
   *  - nextRunAt in the future  -> SCHEDULED (scheduler promotes when due)
   *  - otherwise                -> QUEUED + immediate Redis notification
   * Queue status is enforced per QueueService semantics:
   *  - DRAINING / DISABLED / ARCHIVED reject new jobs
   * Idempotency: pass idempotencyKey; a duplicate submission returns the
   * original job with 200 instead of creating a second one.
   */
  static async create(req: Request, res: Response) {
    const { queueId, type, payload, priority, nextRunAt, idempotencyKey, dependsOn, dependencies } = req.body;
    const ctx = getContext();
    const rawParents = Array.isArray(dependencies) ? dependencies : dependsOn;
    const parentIds: string[] = Array.isArray(rawParents) ? rawParents : [];

    if (idempotencyKey) {
      const existing = await db.job.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return res.status(200).json({ ...existing, deduplicated: true });
      }
    }

    const queue = await db.queue.findUnique({
      where: { id: queueId },
      select: { status: true },
    });
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    if (
      queue.status === QueueStatus.DRAINING ||
      queue.status === QueueStatus.DISABLED ||
      queue.status === QueueStatus.ARCHIVED
    ) {
      return res.status(409).json({ error: `Queue is ${queue.status} and rejects new jobs` });
    }

    const runAt = nextRunAt ? new Date(nextRunAt) : null;
    const isFuture = runAt !== null && runAt.getTime() > Date.now();

    // DAG dependencies: parents must exist. Edges always point to pre-existing
    // jobs, so cycles are impossible by construction.
    let parentsDone = false;
    if (parentIds.length > 0) {
      const parents = await db.job.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, status: true },
      });
      if (parents.length !== parentIds.length) {
        return res.status(400).json({ error: 'One or more dependsOn parent jobs do not exist' });
      }
      const deadParent = parents.find(p =>
        ([JobStatus.DLQ, JobStatus.CANCELLED, JobStatus.ARCHIVED] as JobStatus[]).includes(p.status)
      );
      if (deadParent) {
        return res.status(409).json({ error: `Parent job ${deadParent.id} terminated without completing; child can never run` });
      }
      parentsDone = parents.every(p => p.status === JobStatus.COMPLETED);
    }

    let job;
    try {
      job = await db.$transaction(async (tx) => {
        const created = await tx.job.create({
        data: {
          queueId,
          name: req.body.name || 'Unnamed Job',
          type,
          payload,
          maxRetries: 3,
          priority: priority || 0,
          status: parentIds.length > 0 && !parentsDone
            ? JobStatus.BLOCKED
            : isFuture ? JobStatus.SCHEDULED : JobStatus.QUEUED,
          nextRunAt: runAt,
          idempotencyKey: idempotencyKey || null,
          correlationId: ctx?.correlationId || `corr-${Math.random().toString(36).substr(2, 9)}`,
        }
        });

        if (parentIds.length > 0) {
          await tx.jobDependency.createMany({
            data: parentIds.map(parentJobId => ({ parentJobId, childJobId: created.id })),
          });
        }
        return created;
      });
    } catch (e) {
      // Unique-violation race on idempotencyKey — return the winner's row
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && idempotencyKey) {
        const existing = await db.job.findUnique({ where: { idempotencyKey } });
        if (existing) return res.status(200).json({ ...existing, deduplicated: true });
      }
      throw e;
    }

    // Immediate jobs notify workers right away — no 5s scheduler round-trip.
    // BLOCKED jobs publish nothing; the dependency engine notifies on release.
    if (!isFuture && job.status === JobStatus.QUEUED) {
      await redis.xadd(`queue:${queueId}`, '*', 'jobId', job.id)
        .catch(err => {
          // Notification lost is recoverable: slow sweeper republishes QUEUED drift.
          console.error('Failed to publish queue notification:', err);
        });
    }

    res.status(201).json(job);
  }

  static async get(req: Request, res: Response) {
    const { id } = req.params;
    const job = await db.job.findUnique({
      where: { id },
      include: { history: true, executions: true, dlqEntry: true }
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  }

  /**
   * DLQ replay: DLQ -> QUEUED, retry budget reset, fresh notification.
   */
  static async replay(req: Request, res: Response) {
    const { id } = req.params;
    const job = await db.job.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.status !== JobStatus.DLQ) {
      return res.status(409).json({ error: `Job is ${job.status}; only DLQ jobs can be replayed` });
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.job.updateMany({
        where: { id, status: JobStatus.DLQ },
        data: {
          status: JobStatus.QUEUED,
          retryCount: 0,
          nextRunAt: new Date(),
          lockedBy: null,
          lockedAt: null,
        },
      });
      if (result.count === 0) {
        throw new Error('Replay race: job left DLQ before replay committed');
      }
      await tx.jobExecutionHistory.create({
        data: {
          jobId: id,
          previousState: JobStatus.DLQ,
          newState: JobStatus.QUEUED,
          actor: 'api:replay',
          reason: 'Manual DLQ replay',
        },
      });
      return tx.job.findUnique({ where: { id } });
    });

    await redis.xadd(`queue:${job.queueId}`, '*', 'jobId', job.id)
      .catch(err => console.error('Failed to publish replayed job:', err));

    metrics.dlqResolutionTotal.inc({ queue_id: job.queueId, resolution_type: 'replayed' });
    res.json(updated);
  }

  /**
   * Cooperative cancellation:
   *  - QUEUED / SCHEDULED / BLOCKED / RETRY_WAITING -> CANCELLED immediately
   *  - CLAIMED / RUNNING -> CANCELLING; the owning worker observes it on its
   *    job heartbeat and completes the cancel (late results are discarded).
   *  - CANCELLING / CANCELLED -> idempotent 200
   *  - COMPLETED / FAILED / DLQ / ARCHIVED -> 409
   * Cancellation of a running executor is cooperative: the worker stops
   * tracking the job at the next heartbeat, it cannot kill arbitrary
   * in-flight executor code.
   */
  static async cancel(req: Request, res: Response) {
    const { id } = req.params;
    const job = await db.job.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === JobStatus.CANCELLING || job.status === JobStatus.CANCELLED) {
      return res.json(job);
    }

    const uncancellable: JobStatus[] = [
      JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.DLQ, JobStatus.ARCHIVED,
    ];
    if (uncancellable.includes(job.status)) {
      return res.status(409).json({ error: `Job is ${job.status}; it cannot be cancelled` });
    }

    const inFlight = job.status === JobStatus.CLAIMED || job.status === JobStatus.RUNNING;
    const nextState = inFlight ? JobStatus.CANCELLING : JobStatus.CANCELLED;

    try {
      const updated = await db.$transaction(async (tx) => {
        const result = await tx.job.updateMany({
          where: { id, status: job.status },
          data: {
            status: nextState,
            // In-flight jobs keep their lock so the owning worker remains
            // identifiable; pre-dispatch jobs hold no lock anyway.
            ...(inFlight ? {} : { lockedBy: null, lockedAt: null }),
          },
        });
        if (result.count === 0) {
          throw new Error('Cancel race: job changed state before cancel committed');
        }
        await tx.jobExecutionHistory.create({
          data: {
            jobId: id,
            previousState: job.status,
            newState: nextState,
            actor: 'api:cancel',
            reason: 'Manual cancellation requested',
          },
        });
        return tx.job.findUnique({ where: { id } });
      });

      metrics.jobsCancelledTotal.inc({
        queue_id: job.queueId,
        phase: inFlight ? 'in_flight' : 'pre_dispatch',
      });
      res.json(updated);
    } catch {
      // The job moved between read and write — report its real state.
      const current = await db.job.findUnique({ where: { id } });
      if (current && (current.status === JobStatus.CANCELLING || current.status === JobStatus.CANCELLED)) {
        return res.json(current);
      }
      return res.status(409).json({
        error: `Job changed state during cancel; current state is ${current?.status ?? 'unknown'}`,
      });
    }
  }

  static async list(req: Request, res: Response) {
    const { queueId, status } = req.query;

    const where: any = {};
    if (queueId) {
      where.queueId = String(queueId);
    }
    if (status) {
      where.status = String(status);
    }

    const jobs = await db.job.findMany({
      where,
      take: 100,
      orderBy: { createdAt: 'desc' }
    });
    res.json(jobs);
  }
}

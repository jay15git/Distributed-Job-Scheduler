import { Request, Response } from 'express';
import { prisma as db } from '../database/db';

export class QueueController {
  static async create(req: Request, res: Response) {
    const { projectId, name, configuration, retryPolicyId } = req.body;

    const queue = await db.queue.create({
      data: {
        projectId,
        name,
        retryPolicyId: retryPolicyId || null,
        configuration: {
          create: configuration || {}
        }
      },
      include: { configuration: true, retryPolicy: true }
    });

    res.status(201).json(queue);
  }

  static async get(req: Request, res: Response) {
    const { id } = req.params;
    const queue = await db.queue.findUnique({
      where: { id },
      include: { configuration: true, retryPolicy: true }
    });
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    res.json(queue);
  }

  static async list(req: Request, res: Response) {
    const { projectId } = req.query;
    const where: any = {};
    if (projectId) {
      where.projectId = String(projectId);
    }
    const queues = await db.queue.findMany({
      where,
      include: { configuration: true }
    });
    res.json(queues);
  }

  static async updateStatus(req: Request, res: Response) {
    const { id } = req.params;
    const { status } = req.body;

    const queue = await db.queue.findUnique({ where: { id } });
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }

    const updated = await db.queue.update({
      where: { id },
      data: { status }
    });

    res.json(updated);
  }

  /**
   * Attach (or detach with null) the retry policy the RetryEngine evaluates
   * failed jobs against.
   */
  static async updateRetryPolicy(req: Request, res: Response) {
    const { id } = req.params;
    const { retryPolicyId } = req.body;

    const queue = await db.queue.findUnique({ where: { id } });
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    if (retryPolicyId !== null && retryPolicyId !== undefined) {
      const policy = await db.retryPolicy.findUnique({ where: { id: retryPolicyId } });
      if (!policy) {
        return res.status(404).json({ error: 'Retry policy not found' });
      }
    }

    const updated = await db.queue.update({
      where: { id },
      data: { retryPolicyId: retryPolicyId ?? null },
      include: { retryPolicy: true },
    });

    res.json(updated);
  }
}

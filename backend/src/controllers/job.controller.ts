import { Request, Response } from 'express';
import { prisma as db } from '../database/db';
import { getContext } from '../config/context';

export class JobController {
  static async create(req: Request, res: Response) {
    const { queueId, type, payload, priority } = req.body;
    const ctx = getContext();
    
    const job = await db.job.create({
      data: {
        queueId,
        name: req.body.name || 'Unnamed Job',
        type,
        payload,
        maxRetries: 3,
        priority: priority || 0,
        status: 'SCHEDULED',
        nextRunAt: req.body.nextRunAt ? new Date(req.body.nextRunAt) : new Date(),
        correlationId: ctx?.correlationId || `corr-${Math.random().toString(36).substr(2, 9)}`,
      }
    });

    res.status(201).json(job);
  }

  static async get(req: Request, res: Response) {
    const { id } = req.params;
    const job = await db.job.findUnique({
      where: { id },
      include: { history: true, executions: true }
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
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

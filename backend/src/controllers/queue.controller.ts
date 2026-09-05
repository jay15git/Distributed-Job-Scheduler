import { Request, Response } from 'express';
import { prisma as db } from '../database/db';

export class QueueController {
  static async create(req: Request, res: Response) {
    const { projectId, name, configuration } = req.body;
    
    const queue = await db.queue.create({
      data: {
        projectId,
        name,
        configuration: {
          create: configuration || {}
        }
      },
      include: { configuration: true }
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
    const { status } = req.body; // ACTIVE, PAUSED, DRAINING, DISABLED, ARCHIVED
    
    // In a real app we'd trigger the queue synchronization here (Phase 4F)
    const queue = await db.queue.update({
      where: { id },
      data: { status }
    });
    
    res.json(queue);
  }
}

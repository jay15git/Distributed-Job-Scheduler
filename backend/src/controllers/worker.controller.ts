import { Request, Response } from 'express';
import { prisma as db } from '../database/db';

export class WorkerController {
  static async list(req: Request, res: Response) {
    const workers = await db.worker.findMany({
      orderBy: { lastSeen: 'desc' }
    });
    
    const mappedWorkers = workers.map(w => ({
      ...w,
      lastHeartbeatAt: w.lastSeen,
      queues: w.supportedQueues,
      currentJobs: 0, // Mocked since active jobs aren't stored on worker directly
      name: w.hostname
    }));

    res.json({ data: mappedWorkers });
  }
}

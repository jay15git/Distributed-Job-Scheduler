import { Request, Response } from 'express';
import { prisma as db } from '../database/db';

export class ProjectController {
  static async create(req: Request, res: Response) {
    const { organizationId, name } = req.body;
    
    // In a real app we'd validate permissions
    const project = await db.project.create({
      data: {
        organizationId,
        name,
        createdBy: req.user?.id || 'system'
      }
    });

    res.status(201).json(project);
  }

  static async get(req: Request, res: Response) {
    const { id } = req.params;
    const project = await db.project.findUnique({
      where: { id },
      include: { queues: true }
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  }

  static async list(req: Request, res: Response) {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }
    const projects = await db.project.findMany({
      where: { organizationId: String(organizationId) }
    });
    res.json(projects);
  }
}

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

    // Tenant scoping: API keys see only their own project; JWT users see
    // projects in organizations they belong to. An explicit organizationId
    // outside the caller's membership is rejected rather than filtered.
    if (req.apiKey) {
      const project = await db.project.findUnique({ where: { id: req.apiKey.projectId } });
      return res.json(project ? [project] : []);
    }

    const memberships = await db.organizationMember.findMany({
      where: { userId: req.user!.id },
      select: { organizationId: true },
    });
    const orgIds = memberships.map(m => m.organizationId);

    if (organizationId && !orgIds.includes(String(organizationId))) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }

    const projects = await db.project.findMany({
      where: organizationId
        ? { organizationId: String(organizationId) }
        : { organizationId: { in: orgIds } },
    });
    res.json(projects);
  }
}

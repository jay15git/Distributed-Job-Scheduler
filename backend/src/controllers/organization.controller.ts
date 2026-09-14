import { Request, Response } from 'express';
import { prisma as db } from '../database/db';

export class OrganizationController {
  static async create(req: Request, res: Response) {
    const userId = req.user?.id;
    const { name, slug } = req.body;
    
    // In a real app we'd validate slug uniqueness, etc.
    const org = await db.organization.create({
      data: {
        name,
        slug,
        members: {
          create: {
            userId: userId!,
            role: 'ORG_ADMIN'
          }
        }
      }
    });

    res.status(201).json(org);
  }

  static async get(req: Request, res: Response) {
    const { id } = req.params;
    const org = await db.organization.findUnique({
      where: { id },
      include: { members: true, projects: true }
    });
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(org);
  }

  static async list(req: Request, res: Response) {
    // API-key callers are project-scoped: they may see the single
    // organization their project belongs to, never the full tenant list.
    if (req.apiKey) {
      const project = await db.project.findUnique({
        where: { id: req.apiKey.projectId },
        select: { organizationId: true },
      });
      const org = project
        ? await db.organization.findUnique({ where: { id: project.organizationId } })
        : null;
      return res.json(org ? [org] : []);
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const orgs = await db.organization.findMany({
      where: { members: { some: { userId: req.user.id } } }
    });
    res.json(orgs);
  }
}

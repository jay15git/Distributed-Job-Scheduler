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
    const userId = req.user?.id;
    const orgs = await db.organization.findMany({
      where: { members: { some: { userId } } }
    });
    res.json(orgs);
  }
}

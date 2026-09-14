import { Request, Response } from 'express';
import { prisma as db } from '../database/db';
import { RetryPolicyService } from '../services/retry-policy.service';
import { RetryPolicyRepository } from '../repositories/retry-policy.repository';

const service = new RetryPolicyService(new RetryPolicyRepository(db));

export class RetryPolicyController {
  static async create(req: Request, res: Response) {
    const policy = await service.createPolicy(req.body);
    res.status(201).json(policy);
  }

  static async list(req: Request, res: Response) {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }
    res.json(await service.listPolicies(String(organizationId)));
  }

  static async get(req: Request, res: Response) {
    res.json(await service.getPolicy(req.params.id));
  }

  static async update(req: Request, res: Response) {
    res.json(await service.updatePolicy(req.params.id, req.body));
  }

  static async remove(req: Request, res: Response) {
    await service.deletePolicy(req.params.id);
    res.status(204).end();
  }
}

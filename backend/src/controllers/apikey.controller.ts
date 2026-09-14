import { Request, Response } from 'express';
import { prisma as db } from '../database/db';
import { ApiKeyService } from '../services/apikey.service';
import { ApiKeyRepository } from '../repositories/apikey.repository';

const service = new ApiKeyService(new ApiKeyRepository(db));

export class ApiKeyController {
  /**
   * Creates a project-scoped API key. The raw token is returned exactly once —
   * only its SHA-256 hash is persisted.
   */
  static async create(req: Request, res: Response) {
    const { name, scopes, expiresAt } = req.body;
    const { apiKey, rawToken } = await service.createApiKey({
      projectId: req.params.projectId,
      name,
      scopes,
      createdBy: req.user!.id,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    res.status(201).json({ apiKey, token: rawToken });
  }

  static async list(req: Request, res: Response) {
    res.json(await service.listApiKeys(req.params.projectId));
  }

  static async revoke(req: Request, res: Response) {
    const key = await service.revokeApiKey(req.params.id, req.body?.reason);
    res.json(key);
  }

  static async regenerate(req: Request, res: Response) {
    const { apiKey, rawToken } = await service.regenerateApiKey(req.params.id, req.user!.id);
    res.status(201).json({ apiKey, token: rawToken });
  }

  static async remove(req: Request, res: Response) {
    await service.deleteApiKey(req.params.id, req.user!.id);
    res.status(204).send();
  }
}

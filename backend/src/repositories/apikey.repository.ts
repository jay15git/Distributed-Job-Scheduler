import { TransactionClient } from '../database/db';
import { ApiKeyScope } from '@prisma/client';

export class ApiKeyRepository {
  constructor(private readonly db: TransactionClient) {}

  async createApiKey(data: {
    projectId: string;
    name: string;
    keyHash: string;
    prefix: string;
    scopes: ApiKeyScope[];
    createdBy: string;
    expiresAt?: Date;
  }) {
    return this.db.apiKey.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        keyHash: data.keyHash,
        prefix: data.prefix,
        scopes: data.scopes,
        createdBy: data.createdBy,
        expiresAt: data.expiresAt,
      },
    });
  }

  async getApiKeyById(id: string) {
    return this.db.apiKey.findUnique({
      where: { id },
    });
  }

  async getApiKeyByHash(keyHash: string) {
    return this.db.apiKey.findUnique({
      where: { keyHash },
    });
  }

  async listApiKeys(projectId: string) {
    return this.db.apiKey.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        isRevoked: true,
        createdAt: true,
      },
    });
  }

  async revokeApiKey(id: string, reason?: string) {
    return this.db.apiKey.update({
      where: { id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  async deleteApiKey(id: string, deletedBy: string) {
    return this.db.apiKey.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy,
      },
    });
  }

  async recordUsage(id: string, ipAddress?: string, userAgent?: string) {
    return this.db.apiKey.update({
      where: { id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: ipAddress,
        lastUsedUserAgent: userAgent,
        usageCount: {
          increment: 1,
        },
      },
    });
  }
}

import crypto from 'crypto';
import { ApiKeyRepository } from '../repositories/apikey.repository';
import { ApiKeyScope } from '@prisma/client';

export class ApiKeyService {
  constructor(private readonly apiKeyRepo: ApiKeyRepository) {}

  /**
   * Generates a new API key using the GitHub pattern: prefix + 32 random characters
   */
  async createApiKey(data: {
    projectId: string;
    name: string;
    scopes: ApiKeyScope[];
    createdBy: string;
    expiresAt?: Date;
  }) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const prefix = 'djs_proj_';
    const fullToken = `${prefix}${rawToken}`;

    // SHA-256 is used for fast, secure hashing since keys have high entropy
    const keyHash = crypto.createHash('sha256').update(fullToken).digest('hex');

    const apiKey = await this.apiKeyRepo.createApiKey({
      projectId: data.projectId,
      name: data.name,
      keyHash,
      prefix,
      scopes: data.scopes,
      createdBy: data.createdBy,
      expiresAt: data.expiresAt,
    });

    return {
      apiKey,
      rawToken: fullToken, // ONLY time this is ever returned
    };
  }

  async validateApiKey(fullToken: string, ipAddress?: string, userAgent?: string) {
    const keyHash = crypto.createHash('sha256').update(fullToken).digest('hex');
    const apiKey = await this.apiKeyRepo.getApiKeyByHash(keyHash);

    if (!apiKey) {
      throw new Error('Invalid API Key');
    }

    if (apiKey.isRevoked) {
      throw new Error('API Key has been revoked');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new Error('API Key has expired');
    }

    if (apiKey.deletedAt) {
      throw new Error('API Key no longer exists');
    }

    // Record usage asynchronously to not block validation
    this.apiKeyRepo.recordUsage(apiKey.id, ipAddress, userAgent).catch(err => {
      console.error(`Failed to record API key usage for ${apiKey.id}`, err);
    });

    return apiKey;
  }

  async listApiKeys(projectId: string) {
    return this.apiKeyRepo.listApiKeys(projectId);
  }

  async revokeApiKey(id: string, reason?: string) {
    return this.apiKeyRepo.revokeApiKey(id, reason);
  }

  async deleteApiKey(id: string, deletedBy: string) {
    return this.apiKeyRepo.deleteApiKey(id, deletedBy);
  }

  async regenerateApiKey(id: string, createdBy: string) {
    const existingKey = await this.apiKeyRepo.getApiKeyById(id);
    if (!existingKey) {
      throw new Error('API Key not found');
    }

    // Revoke old key
    await this.revokeApiKey(id, 'Regenerated');

    // Create new key with same properties
    return this.createApiKey({
      projectId: existingKey.projectId,
      name: existingKey.name,
      scopes: existingKey.scopes,
      createdBy,
      expiresAt: existingKey.expiresAt ?? undefined,
    });
  }
}

import { RetryStrategy } from '@prisma/client';
import { TransactionClient } from '../database/db';

export class RetryPolicyRepository {
  constructor(private readonly db: TransactionClient) {}

  async createPolicy(data: {
    name: string;
    organizationId?: string;
    maxAttempts?: number;
    strategy?: RetryStrategy;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    jitterEnabled?: boolean;
    jitterPercentage?: number;
    retryOnErrorCodes?: string[];
  }) {
    return this.db.retryPolicy.create({
      data: {
        name: data.name,
        organizationId: data.organizationId,
        maxAttempts: data.maxAttempts,
        strategy: data.strategy,
        initialDelayMs: data.initialDelayMs,
        maxDelayMs: data.maxDelayMs,
        backoffMultiplier: data.backoffMultiplier,
        jitterEnabled: data.jitterEnabled,
        jitterPercentage: data.jitterPercentage,
        retryOnErrorCodes: data.retryOnErrorCodes || [],
      },
    });
  }

  async getPolicyById(id: string) {
    return this.db.retryPolicy.findUnique({
      where: { id },
    });
  }

  async listPolicies(organizationId: string) {
    return this.db.retryPolicy.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePolicy(id: string, data: any) {
    return this.db.retryPolicy.update({
      where: { id },
      data,
    });
  }

  async deletePolicy(id: string) {
    return this.db.retryPolicy.delete({
      where: { id },
    });
  }
}

import { RetryPolicyRepository } from '../repositories/retry-policy.repository';
import { RetryStrategy } from '@prisma/client';

export class RetryPolicyService {
  constructor(private readonly retryPolicyRepo: RetryPolicyRepository) {}

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
    // Validation
    if (data.jitterPercentage && (data.jitterPercentage < 0 || data.jitterPercentage > 1)) {
      throw new Error('Jitter percentage must be between 0 and 1');
    }

    if (data.backoffMultiplier && data.backoffMultiplier < 1) {
      throw new Error('Backoff multiplier must be >= 1');
    }

    return this.retryPolicyRepo.createPolicy(data);
  }

  async getPolicy(id: string) {
    const policy = await this.retryPolicyRepo.getPolicyById(id);
    if (!policy) throw new Error('Retry Policy not found');
    return policy;
  }

  async listPolicies(organizationId: string) {
    return this.retryPolicyRepo.listPolicies(organizationId);
  }

  async updatePolicy(id: string, data: any) {
    // Optionally validate if policy is actively used by queues before updating
    return this.retryPolicyRepo.updatePolicy(id, data);
  }

  async deletePolicy(id: string) {
    // Must ensure no active queues are referencing this before deletion, 
    // or rely on Prisma relation constraints
    return this.retryPolicyRepo.deletePolicy(id);
  }

  /**
   * Helper to determine if an error code is retryable based on the policy.
   * If retryOnErrorCodes is empty, everything is retried.
   * Otherwise, the error code must be explicitly listed.
   */
  isRetryable(policy: { retryOnErrorCodes: string[] }, errorCode: string): boolean {
    if (!policy.retryOnErrorCodes || policy.retryOnErrorCodes.length === 0) {
      return true;
    }
    return policy.retryOnErrorCodes.includes(errorCode);
  }
}

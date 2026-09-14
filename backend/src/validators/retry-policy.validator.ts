import { z } from 'zod';
import { RetryStrategy } from '@prisma/client';

export const createRetryPolicySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    organizationId: z.string().uuid('organizationId must be a UUID'),
    maxAttempts: z.number().int().min(1).max(25).optional(),
    strategy: z.nativeEnum(RetryStrategy).optional(),
    initialDelayMs: z.number().int().min(0).optional(),
    maxDelayMs: z.number().int().min(1).optional(),
    backoffMultiplier: z.number().min(1).max(10).optional(),
    jitterEnabled: z.boolean().optional(),
    jitterPercentage: z.number().min(0).max(1).optional(),
    retryOnErrorCodes: z.array(z.string()).optional(),
  }),
});

export const updateRetryPolicySchema = z.object({
  body: createRetryPolicySchema.shape.body.partial().omit({ organizationId: true }),
});

export const listRetryPoliciesSchema = z.object({
  query: z.object({
    organizationId: z.string().uuid(),
  }),
});

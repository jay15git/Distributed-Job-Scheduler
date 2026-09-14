import { z } from 'zod';
import { QueueStatus } from '@prisma/client';

const configurationSchema = z.object({
  concurrencyLimit: z.number().int().min(1).max(1000).optional(),
  workerLimit: z.number().int().min(0).optional(),
  visibilityTimeout: z.number().int().min(1000).optional(),
  claimTimeout: z.number().int().min(1000).optional(),
  heartbeatInterval: z.number().int().min(1000).optional(),
  heartbeatTimeout: z.number().int().min(1000).optional(),
  maxExecutionTime: z.number().int().min(1000).optional(),
  maxPayloadSize: z.number().int().min(1024).optional(),
  allowManualRetry: z.boolean().optional(),
  jobRetentionDays: z.number().int().min(1).optional(),
  dlqRetentionDays: z.number().int().min(1).optional(),
  maxQueueDepth: z.number().int().min(1).optional(),
  rateLimit: z.number().int().min(0).optional(),
  rateLimitWindow: z.number().int().min(100).optional(),
  defaultPriority: z.number().int().min(0).max(100).optional(),
}).partial();

export const createQueueSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('projectId must be a UUID'),
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    configuration: configurationSchema.optional(),
    retryPolicyId: z.string().uuid().optional(),
  }),
});

export const updateQueueStatusSchema = z.object({
  body: z.object({
    status: z.nativeEnum(QueueStatus),
  }),
});

export const updateQueueRetryPolicySchema = z.object({
  body: z.object({
    retryPolicyId: z.string().uuid().nullable(),
  }),
});

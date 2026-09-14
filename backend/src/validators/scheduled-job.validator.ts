import { z } from 'zod';

export const createScheduledJobSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('projectId must be a UUID'),
    name: z.string().min(1).max(255),
    cronExpression: z.string().min(1).max(100),
    timezone: z.string().max(64).optional(),
    payload: z.record(z.unknown()).optional(),
    queueId: z.string().uuid().optional(),
  }),
});

export const updateScheduledJobStatusSchema = z.object({
  body: z.object({
    status: z.enum(['ACTIVE', 'PAUSED']),
  }),
});

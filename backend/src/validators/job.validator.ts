import { z } from 'zod';
import { JobStatus, JobType } from '@prisma/client';

export const createJobSchema = z.object({
  body: z.object({
    queueId: z.string().uuid('queueId must be a UUID'),
    name: z.string().min(1).max(255).optional(),
    type: z.nativeEnum(JobType),
    payload: z.record(z.unknown()).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    nextRunAt: z.string().datetime().optional(),
    idempotencyKey: z.string().min(1).max(255).optional(),
    dependsOn: z.array(z.string().uuid()).max(50).optional(),
    dependencies: z.array(z.string().uuid()).max(50).optional(),
  }),
});

export const listJobsSchema = z.object({
  query: z.object({
    queueId: z.string().uuid().optional(),
    status: z.nativeEnum(JobStatus).optional(),
  }),
});

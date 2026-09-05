import { z } from 'zod';
import { JobPriority, JobStatus, JobType, QueueStatus, RetryStrategy, Role } from '../constants';

// Authentication Schemas
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Pagination Schema
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Queue Schemas
export const CreateQueueSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  priority: z.number().int().optional().default(JobPriority.NORMAL),
  concurrencyLimit: z.number().int().min(1).optional().default(10),
  maxRetry: z.number().int().min(0).optional().default(3),
  retryStrategy: z.nativeEnum(RetryStrategy).optional().default(RetryStrategy.EXPONENTIAL_BACKOFF),
  retryDelay: z.number().int().min(0).optional().default(1000),
  maxDelay: z.number().int().min(0).optional().default(60000),
  workerLimit: z.number().int().min(0).optional().default(0),
  rateLimit: z.number().int().min(0).optional().default(0),
});

export const UpdateQueueSchema = CreateQueueSchema.partial().extend({
  status: z.nativeEnum(QueueStatus).optional(),
});

// Job Schemas
export const CreateJobSchema = z.object({
  name: z.string().min(1).max(255),
  payload: z.record(z.unknown()),
  type: z.nativeEnum(JobType).optional().default(JobType.IMMEDIATE),
  priority: z.number().int().optional().default(JobPriority.NORMAL),
  maxRetries: z.number().int().min(0).optional().default(3),
  nextRunAt: z.string().datetime().optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional().default('UTC'),
  dependencies: z.array(z.string().uuid()).optional(),
});

// Standard Job Payload Schema (Frozen format)
export const JobPayloadSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(JobType),
  payloadVersion: z.number().int().default(1),
  schemaVersion: z.number().int().default(1),
  payload: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
});

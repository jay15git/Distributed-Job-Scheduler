"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobPayloadSchema = exports.CreateJobSchema = exports.UpdateQueueSchema = exports.CreateQueueSchema = exports.PaginationQuerySchema = exports.LoginSchema = exports.RegisterSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
// Authentication Schemas
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters long'),
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters long'),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string(),
});
// Pagination Schema
exports.PaginationQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: zod_1.z.string().optional().default('createdAt'),
    sortOrder: zod_1.z.enum(['asc', 'desc']).optional().default('desc'),
});
// Queue Schemas
exports.CreateQueueSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    description: zod_1.z.string().optional(),
    priority: zod_1.z.number().int().optional().default(constants_1.JobPriority.NORMAL),
    concurrencyLimit: zod_1.z.number().int().min(1).optional().default(10),
    maxRetry: zod_1.z.number().int().min(0).optional().default(3),
    retryStrategy: zod_1.z.nativeEnum(constants_1.RetryStrategy).optional().default(constants_1.RetryStrategy.EXPONENTIAL_BACKOFF),
    retryDelay: zod_1.z.number().int().min(0).optional().default(1000),
    maxDelay: zod_1.z.number().int().min(0).optional().default(60000),
    workerLimit: zod_1.z.number().int().min(0).optional().default(0),
    rateLimit: zod_1.z.number().int().min(0).optional().default(0),
});
exports.UpdateQueueSchema = exports.CreateQueueSchema.partial().extend({
    status: zod_1.z.nativeEnum(constants_1.QueueStatus).optional(),
});
// Job Schemas
exports.CreateJobSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    payload: zod_1.z.record(zod_1.z.unknown()),
    type: zod_1.z.nativeEnum(constants_1.JobType).optional().default(constants_1.JobType.IMMEDIATE),
    priority: zod_1.z.number().int().optional().default(constants_1.JobPriority.NORMAL),
    maxRetries: zod_1.z.number().int().min(0).optional().default(3),
    nextRunAt: zod_1.z.string().datetime().optional(),
    cronExpression: zod_1.z.string().optional(),
    timezone: zod_1.z.string().optional().default('UTC'),
    dependencies: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
// Standard Job Payload Schema (Frozen format)
exports.JobPayloadSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.nativeEnum(constants_1.JobType),
    payloadVersion: zod_1.z.number().int().default(1),
    schemaVersion: zod_1.z.number().int().default(1),
    payload: zod_1.z.record(zod_1.z.unknown()),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
    headers: zod_1.z.record(zod_1.z.string()).optional(),
});

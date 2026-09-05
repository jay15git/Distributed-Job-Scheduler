"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Role = exports.RetryStrategy = exports.QueueStatus = exports.JobType = exports.JobStatus = exports.JobPriority = void 0;
exports.JobPriority = {
    LOW: 1,
    NORMAL: 5,
    HIGH: 10,
    CRITICAL: 100,
};
exports.JobStatus = {
    QUEUED: 'QUEUED',
    SCHEDULED: 'SCHEDULED',
    CLAIMED: 'CLAIMED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    RETRY_WAITING: 'RETRY_WAITING',
    DLQ: 'DLQ',
    ARCHIVED: 'ARCHIVED',
};
exports.JobType = {
    IMMEDIATE: 'IMMEDIATE',
    DELAYED: 'DELAYED',
    SCHEDULED: 'SCHEDULED',
    CRON: 'CRON',
    RECURRING: 'RECURRING',
    WORKFLOW: 'WORKFLOW',
    DEPENDENT: 'DEPENDENT',
    PARALLEL: 'PARALLEL',
    BATCH: 'BATCH',
    WEBHOOK: 'WEBHOOK',
    EVENT_TRIGGERED: 'EVENT_TRIGGERED',
};
exports.QueueStatus = {
    PAUSED: 'PAUSED',
    RUNNING: 'RUNNING',
    STOPPED: 'STOPPED',
};
exports.RetryStrategy = {
    FIXED_DELAY: 'FIXED_DELAY',
    LINEAR_BACKOFF: 'LINEAR_BACKOFF',
    EXPONENTIAL_BACKOFF: 'EXPONENTIAL_BACKOFF',
    CUSTOM: 'CUSTOM',
};
exports.Role = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ORG_ADMIN: 'ORG_ADMIN',
    PROJECT_ADMIN: 'PROJECT_ADMIN',
    DEVELOPER: 'DEVELOPER',
    VIEWER: 'VIEWER',
};

export const JobPriority = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 10,
  CRITICAL: 100,
} as const;

export type JobPriorityType = typeof JobPriority[keyof typeof JobPriority];

export const JobStatus = {
  QUEUED: 'QUEUED',
  SCHEDULED: 'SCHEDULED',
  CLAIMED: 'CLAIMED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RETRY_WAITING: 'RETRY_WAITING',
  DLQ: 'DLQ',
  ARCHIVED: 'ARCHIVED',
} as const;

export type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

export const JobType = {
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
} as const;

export type JobTypeType = typeof JobType[keyof typeof JobType];

export const QueueStatus = {
  PAUSED: 'PAUSED',
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
} as const;

export type QueueStatusType = typeof QueueStatus[keyof typeof QueueStatus];

export const RetryStrategy = {
  FIXED_DELAY: 'FIXED_DELAY',
  LINEAR_BACKOFF: 'LINEAR_BACKOFF',
  EXPONENTIAL_BACKOFF: 'EXPONENTIAL_BACKOFF',
  CUSTOM: 'CUSTOM',
} as const;

export type RetryStrategyType = typeof RetryStrategy[keyof typeof RetryStrategy];

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  PROJECT_ADMIN: 'PROJECT_ADMIN',
  DEVELOPER: 'DEVELOPER',
  VIEWER: 'VIEWER',
} as const;

export type RoleType = typeof Role[keyof typeof Role];

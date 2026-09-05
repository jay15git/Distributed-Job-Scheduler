import { JobTypeType } from '../constants';

export interface JobPayload<T = Record<string, unknown>> {
  id: string; // The Job ID for cross-reference
  type: JobTypeType;
  payloadVersion: number;
  schemaVersion: number;
  payload: T;
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface WorkerHeartbeatPayload {
  workerId: string;
  timestamp: string;
  cpuUsage: number;
  ramUsage: number;
  currentJobs: number;
  runningThreads: number;
  avgJobTimeMs: number;
  failureRate: number;
  version: string;
  host: string;
  ip: string;
  region?: string;
  os: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

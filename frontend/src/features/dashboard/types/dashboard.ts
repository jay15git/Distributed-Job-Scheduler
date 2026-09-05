export interface SystemMetric {
  activeWorkers: number;
  runningJobs: number;
  waitingJobs: number;
  queueDepth: number;
  failedJobs: number;
  dlqDepth: number;
  successRate: number;
  avgExecutionTimeMs: number;
  jobsPerSecond: number;
}

export interface WorkerMetric {
  workerId: string;
  queues: string[];
  status: 'Online' | 'Stale' | 'Offline';
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  lastHeartbeat: Date;
}

export interface QueueMetric {
  queueName: string;
  waitingJobs: number;
  runningJobs: number;
  failedJobs: number;
  successRate: number;
  drainRatePerSec: number;
  oldestWaitingJobAgeMs: number;
}

export interface SchedulerMetric {
  ticksTotal: number;
  jobsProcessed: number;
  jobsFailed: number;
}

export interface DashboardMetrics {
  system: SystemMetric;
  workers: WorkerMetric[];
  queues: QueueMetric[];
  scheduler: SchedulerMetric;
}

export interface JobEvent {
  id: string;
  jobId: string;
  message: string;
  status: string;
  timestamp: Date;
}

export interface PerformanceSample {
  timestamp: number;
  jobsPerSecond: number;
  queueDepth: number;
  avgExecutionLatencyMs: number;
}

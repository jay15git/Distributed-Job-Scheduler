import { DashboardMetrics, QueueMetric, WorkerMetric } from '../types/dashboard';

/**
 * Parses Prometheus exposition format text into structured DashboardMetrics.
 */
export function parsePrometheusMetrics(text: string): DashboardMetrics {
  const lines = text.split('\n');

  // Intermediate maps to accumulate metrics by ID or name
  const workersMap = new Map<string, Partial<WorkerMetric>>();
  const queuesMap = new Map<string, Partial<QueueMetric>>();
  
  let systemActiveWorkers = 0;
  let systemRunningJobs = 0;
  let systemWaitingJobs = 0;
  let systemFailedJobs = 0;
  let systemCompletedJobs = 0;
  let systemDlqDepth = 0;
  let totalExecutionTimeMs = 0;

  const scheduler = {
    ticksTotal: 0,
    jobsProcessed: 0,
    jobsFailed: 0,
  };

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }

    // Match metric_name{labels} value
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:{([^}]*)})?\s+(.+)$/);
    if (!match) continue;

    const [, name, labelsStr, valueStr] = match;
    const value = parseFloat(valueStr);
    if (isNaN(value)) continue;

    // Parse labels
    const labels: Record<string, string> = {};
    if (labelsStr) {
      const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)=("([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')/g;
      let labelMatch;
      while ((labelMatch = labelRegex.exec(labelsStr)) !== null) {
        labels[labelMatch[1]] = labelMatch[3] || labelMatch[4] || '';
      }
    }

    const workerId = labels['worker_id'];
    const queueName = labels['queue'];

    // --- Worker Metrics ---
    if (workerId) {
      if (!workersMap.has(workerId)) {
        workersMap.set(workerId, { workerId, queues: [], activeJobs: 0, completedJobs: 0, failedJobs: 0 });
      }
      const w = workersMap.get(workerId)!;
      
      // Attempt to infer queues handled from labels if provided
      if (queueName && !w.queues!.includes(queueName)) {
        w.queues!.push(queueName);
      }

      switch (name) {
        case 'worker_active_jobs':
          w.activeJobs = (w.activeJobs || 0) + value;
          break;
        case 'worker_jobs_completed_total':
          w.completedJobs = (w.completedJobs || 0) + value;
          break;
        case 'worker_jobs_failed_total':
          w.failedJobs = (w.failedJobs || 0) + value;
          break;
        case 'worker_heartbeat_timestamp':
          w.lastHeartbeat = new Date(value * 1000); // Assuming seconds
          break;
      }
    }

    // --- Queue Metrics ---
    if (queueName) {
      if (!queuesMap.has(queueName)) {
        queuesMap.set(queueName, { queueName, waitingJobs: 0, runningJobs: 0, failedJobs: 0, successRate: 100, drainRatePerSec: 0, oldestWaitingJobAgeMs: 0 });
      }
      const q = queuesMap.get(queueName)!;

      switch (name) {
        case 'queue_waiting_jobs':
          q.waitingJobs = value;
          systemWaitingJobs += value;
          break;
        case 'queue_active_jobs':
          q.runningJobs = value;
          systemRunningJobs += value;
          break;
        case 'queue_failed_jobs_total':
          q.failedJobs = value;
          systemFailedJobs += value;
          break;
        case 'queue_completed_jobs_total':
          systemCompletedJobs += value;
          break;
        case 'queue_oldest_waiting_job_age_seconds':
          q.oldestWaitingJobAgeMs = value * 1000;
          break;
        case 'queue_job_drain_rate_per_second':
          q.drainRatePerSec = value;
          break;
      }
    }

    // --- System / Aggregate Metrics ---
    switch (name) {
      case 'worker_active_jobs':
        // If not already summed by queue
        if (!queueName && !workerId) systemRunningJobs += value; 
        break;
      case 'dlq_jobs_total':
      case 'queue_dlq_jobs':
        systemDlqDepth += value;
        break;
      case 'scheduler_ticks_total':
        scheduler.ticksTotal = value;
        break;
      case 'scheduler_scheduled_jobs_processed_total':
        scheduler.jobsProcessed = value;
        break;
      case 'scheduler_scheduled_jobs_failed_total':
        scheduler.jobsFailed = value;
        break;
      case 'worker_job_execution_duration_seconds_sum':
        totalExecutionTimeMs += value * 1000;
        break;
    }
  }

  const now = new Date().getTime();
  const workers: WorkerMetric[] = Array.from(workersMap.values()).map(w => {
    let status: 'Online' | 'Stale' | 'Offline' = 'Offline';
    if (w.lastHeartbeat) {
      const ageMs = now - w.lastHeartbeat.getTime();
      if (ageMs < 10000) status = 'Online'; // < 10s
      else if (ageMs < 30000) status = 'Stale'; // < 30s
    }
    
    return {
      workerId: w.workerId || 'unknown',
      queues: w.queues || [],
      status,
      activeJobs: w.activeJobs || 0,
      completedJobs: w.completedJobs || 0,
      failedJobs: w.failedJobs || 0,
      lastHeartbeat: w.lastHeartbeat || new Date(0),
    };
  });

  const queues: QueueMetric[] = Array.from(queuesMap.values()).map(q => {
    // We don't have per-queue completion strictly from the default labels in some setups,
    // so we just calculate based on available data.
    const totalProcessed = (q.runningJobs || 0) + (q.failedJobs || 0); // Simplified
    return {
      queueName: q.queueName || 'unknown',
      waitingJobs: q.waitingJobs || 0,
      runningJobs: q.runningJobs || 0,
      failedJobs: q.failedJobs || 0,
      successRate: 100, // Would need completed jobs per queue for accurate rate
      drainRatePerSec: q.drainRatePerSec || 0,
      oldestWaitingJobAgeMs: q.oldestWaitingJobAgeMs || 0,
    };
  });

  systemActiveWorkers = workers.filter(w => w.status === 'Online').length;
  
  const totalFinished = systemCompletedJobs + systemFailedJobs;
  const systemSuccessRate = totalFinished > 0 
    ? (systemCompletedJobs / totalFinished) * 100 
    : 100;
  
  const avgExecutionTimeMs = totalFinished > 0 
    ? totalExecutionTimeMs / totalFinished 
    : 0;

  return {
    system: {
      activeWorkers: systemActiveWorkers,
      runningJobs: systemRunningJobs,
      waitingJobs: systemWaitingJobs,
      queueDepth: systemWaitingJobs,
      failedJobs: systemFailedJobs,
      dlqDepth: systemDlqDepth,
      successRate: systemSuccessRate,
      avgExecutionTimeMs,
      jobsPerSecond: 0, // Calculated historically in the hook
    },
    workers,
    queues,
    scheduler,
  };
}

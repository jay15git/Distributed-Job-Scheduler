import { QueueMetricsRepository } from '../repositories/queue-metrics.repository';

export class QueueMetricsService {
  constructor(private readonly metricsRepo: QueueMetricsRepository) {}

  /**
   * Called periodically (e.g. every minute) to snapshot current queue state
   */
  async recordSnapshot(data: {
    queueId: string;
    queuedJobs: number;
    claimedJobs: number;
    runningJobs: number;
    activeWorkers: number;
    throughput: number;
    backlog: number;
    avgWaitTimeMs: number;
    avgProcTimeMs: number;
    successRate: number;
    retryRate: number;
    dlqRate: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  }) {
    return this.metricsRepo.insertMetricSnapshot(data);
  }

  async getLiveMetrics(queueId: string) {
    // Fetches the most recent minute's snapshot
    const metrics = await this.metricsRepo.getMetricsSeries(
      queueId,
      new Date(Date.now() - 60000 * 5), // last 5 minutes
      new Date()
    );
    return metrics[metrics.length - 1] || null;
  }

  async getHistoricalMetrics(queueId: string, since: Date, until: Date) {
    return this.metricsRepo.getMetricsSeries(queueId, since, until);
  }

  /**
   * Executed via cron to aggregate raw metrics into hourly/daily rollups
   * and delete raw metrics older than the retention threshold (e.g. 7 days)
   */
  async aggregateAndPurgeMetrics(queueId: string) {
    // 1. Fetch raw metrics for the past hour/day
    // 2. Compute rollups (avg, max, min for throughput, latency, etc.)
    // 3. Store in a separate aggregated metrics table (not shown for brevity)
    // 4. Purge raw metrics > 7 days old
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    await this.metricsRepo.deleteMetricsOlderThan(queueId, sevenDaysAgo);
  }
}

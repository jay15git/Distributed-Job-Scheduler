import { TransactionClient } from '../database/db';

export class QueueMetricsRepository {
  constructor(private readonly db: TransactionClient) {}

  async insertMetricSnapshot(data: {
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
    return this.db.queueMetric.create({
      data,
    });
  }

  async getMetricsSeries(queueId: string, since: Date, until: Date) {
    return this.db.queueMetric.findMany({
      where: {
        queueId,
        timestamp: {
          gte: since,
          lte: until,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  async deleteMetricsOlderThan(queueId: string, threshold: Date) {
    return this.db.queueMetric.deleteMany({
      where: {
        queueId,
        timestamp: {
          lt: threshold,
        },
      },
    });
  }
}

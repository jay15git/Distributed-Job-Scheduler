-- Add BLOCKED status for DAG-gated jobs
ALTER TYPE "JobStatus" ADD VALUE 'BLOCKED';

-- Drop dead-schema models that had no engine or API behind them:
-- ApiRequestLog, SystemConfiguration, FeatureFlag, RateLimitBucket,
-- JobBatch, Notification, WebhookEvent
DROP TABLE "ApiRequestLog";
DROP TABLE "SystemConfiguration";
DROP TABLE "FeatureFlag";
DROP TABLE "RateLimitBucket";
DROP TABLE "Notification";
DROP TABLE "WebhookEvent";
DROP TYPE "WebhookStatus";

-- Job.batchId pointed at the removed JobBatch model
DROP INDEX "Job_batchId_idx";
ALTER TABLE "Job" DROP COLUMN "batchId";
DROP TABLE "JobBatch";

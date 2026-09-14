-- AlterTable
ALTER TABLE "Job" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "ScheduledJob" ADD COLUMN "queueId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScheduledJob_status_nextRunAt_idx" ON "ScheduledJob"("status", "nextRunAt");

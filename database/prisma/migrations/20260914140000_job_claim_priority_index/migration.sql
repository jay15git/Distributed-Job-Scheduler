-- Serves the worker's ordered SKIP LOCKED claim:
-- WHERE queueId = $1 AND status = 'QUEUED' ORDER BY priority DESC, createdAt ASC
CREATE INDEX "Job_queueId_status_priority_createdAt_idx"
  ON "Job" ("queueId", "status", "priority" DESC, "createdAt");

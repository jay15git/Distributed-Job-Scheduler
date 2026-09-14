-- Track which scheduler replica holds a leadership lease.
ALTER TABLE "SchedulerLock" ADD COLUMN IF NOT EXISTS "holderId" TEXT;
CREATE INDEX IF NOT EXISTS "SchedulerLock_expiresAt_idx" ON "SchedulerLock"("expiresAt");

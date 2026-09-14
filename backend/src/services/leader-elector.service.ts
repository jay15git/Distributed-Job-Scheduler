import crypto from 'crypto';
import { TransactionClient } from '../database/db';
import { logger } from '../config/logger';

/**
 * Database-backed leader election on the SchedulerLock table.
 *
 * One row per lockKey; a replica leads while its lease is unexpired.
 * tryLead() is a single conditional upsert: it takes the lock when the
 * row is absent/expired, or renews it when this replica already holds it.
 * An expired lease can be stolen by any replica — correctness still holds
 * without leadership because the engines batch-claim with SKIP LOCKED;
 * election only avoids duplicated scans across replicas.
 */
export class LeaderElector {
  private readonly holderId: string;
  private isLeader = false;

  constructor(
    private readonly db: TransactionClient,
    private readonly lockKey: string = 'scheduler-leader',
    private readonly ttlMs: number = 15_000,
    holderId?: string,
  ) {
    this.holderId = holderId ?? `scheduler-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /** Attempts to acquire or renew the lease. Returns true when this replica leads. */
  async tryLead(): Promise<boolean> {
    const now = new Date();
    const expiry = new Date(now.getTime() + this.ttlMs);
    try {
      const affected = await this.db.$executeRaw`
        INSERT INTO "SchedulerLock" (id, "lockKey", "holderId", "lockedAt", "expiresAt")
        VALUES (${crypto.randomUUID()}, ${this.lockKey}, ${this.holderId}, ${now}, ${expiry})
        ON CONFLICT ("lockKey") DO UPDATE
          SET "holderId" = ${this.holderId},
              "lockedAt" = ${now},
              "expiresAt" = ${expiry}
        WHERE "SchedulerLock"."expiresAt" < ${now}
           OR "SchedulerLock"."holderId" = ${this.holderId}
      `;
      const leader = affected === 1;
      if (leader !== this.isLeader) {
        logger.info({ lockKey: this.lockKey, holderId: this.holderId },
          leader ? 'Acquired scheduler leadership' : 'Lost scheduler leadership');
        this.isLeader = leader;
      }
      return leader;
    } catch (err) {
      logger.error({ err, lockKey: this.lockKey }, 'Leader election check failed');
      return this.isLeader; // transient DB error: keep previous stance this tick
    }
  }

  getHolderId() {
    return this.holderId;
  }
}

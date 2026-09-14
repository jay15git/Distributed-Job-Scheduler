import { describe, it, expect, afterAll } from 'vitest';
import { prisma as db } from '../../src/database/db';
import { LeaderElector } from '../../src/services/leader-elector.service';

describe('Leader election (SchedulerLock)', () => {
  const lockKey = `test-lock-${Date.now()}`;

  afterAll(async () => {
    await db.schedulerLock.deleteMany({ where: { lockKey } });
  });

  it('grants the lease to exactly one replica at a time', async () => {
    const a = new LeaderElector(db, lockKey, 15_000, 'replica-a');
    const b = new LeaderElector(db, lockKey, 15_000, 'replica-b');

    expect(await a.tryLead()).toBe(true);
    expect(await b.tryLead()).toBe(false);
    // Holder renews fine
    expect(await a.tryLead()).toBe(true);
    expect(await b.tryLead()).toBe(false);
  });

  it('fails over after the lease expires', async () => {
    const lockKey2 = `${lockKey}-failover`;
    const a = new LeaderElector(db, lockKey2, 50, 'replica-a'); // 50ms ttl
    const b = new LeaderElector(db, lockKey2, 15_000, 'replica-b');
    try {
      expect(await a.tryLead()).toBe(true);
      await new Promise(r => setTimeout(r, 80)); // let the lease lapse
      expect(await b.tryLead()).toBe(true);      // b takes over
      expect(await a.tryLead()).toBe(false);     // a cannot steal it back
    } finally {
      await db.schedulerLock.deleteMany({ where: { lockKey: lockKey2 } });
    }
  });
});

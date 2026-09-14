# Database Indexes Documentation

The persistence layer for the Distributed Job Scheduler leverages PostgreSQL, managed via Prisma. The most critical operational requirement is ensuring fast job claiming, which necessitates precise indexing.

## Critical Indexes

### Job Claiming Index
```prisma
@@index([queueId, status, nextRunAt])
```
**Reasoning**: When a worker polls for jobs, it issues a query resembling:
`SELECT * FROM Job WHERE queueId = ? AND status = 'QUEUED' AND (nextRunAt <= NOW() OR nextRunAt IS NULL) ORDER BY priority DESC, createdAt ASC LIMIT ? FOR UPDATE SKIP LOCKED`
This composite index covers the `queueId`, `status`, and `nextRunAt` fields exactly as they are queried, avoiding sequential scans on the massive Job table.

### Queue Metric History
```prisma
@@index([queueId, timestamp])
```
**Reasoning**: Facilitates rapid time-series analysis for metrics dashboards, allowing fast lookups of queue performance within specific time windows.

### Soft Deletes & Filtering
While not explicitly created as composite indexes across all tables, Prisma automatically leverages primary keys. To ensure fast queries on active items, queries include `deletedAt: null`. For high volume queries, future migrations may add partial indexes (`WHERE deletedAt IS NULL`), but this is currently deferred pending query volume analysis.

## Foreign Key Constraints & Cascading

- **Cascade Deletion**: When an `Organization` is deleted, all its `Project`s are cascaded. When a `Project` is deleted, its `Queue`s are cascaded. When a `Queue` is deleted, its `Job`s are cascaded.
- **Set Null**: Reassignable references — like `AuditLog.userId` or `Job.retryPolicyId` — use `SetNull` so history survives deletion of the referenced row.

## UUID Strategy

Every primary key in the system uses a universally unique identifier (UUID v4).
```prisma
id String @id @default(uuid())
```
This avoids predictable IDs (preventing enumeration attacks) and allows distributed ID generation safely without relying on a central database sequence, critical for high-throughput job ingestion.

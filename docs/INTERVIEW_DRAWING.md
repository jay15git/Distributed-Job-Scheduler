# Distributed Job Scheduler · Interview drawing sheet

**How to use.** Draw the spine in the numbered order (~90 seconds). Then say the box blurbs. If they push, use the four follow-ups at the end.

**Say this while you draw the three service boxes.** One **backend** Docker image boots as three processes via `ROLE`: `api` / `scheduler` / `worker`. Postgres, Redis, the Next.js dashboard, Prometheus, and Grafana are **separate** containers. Do not say “the whole product is one image.”

**The one fact that must not get mixed up.** `FOR UPDATE SKIP LOCKED` is how the **scheduler** picks due rows. Workers do **not** claim with skip-locked. Workers claim with `UPDATE … WHERE status = QUEUED`.

---

## The diagram

Draw in numbered order.

```
CLIENT                         POSTGRESQL  (only source of truth)
dashboard · REST · SDK         Job  status · payload · priority
                               retryCount · nextRunAt
     1  POST /api/v1/jobs      lockedBy · lastHeartbeat
        Bearer JWT  or         JobExecutionHistory  (one row per change)
        X-API-Key              JobExecution  output · error · duration
              │                DeadLetterQueue  parked poison jobs
              ▼                Worker + Heartbeat  who is alive
         API                   Org → Project → Queue + RetryPolicy
    ROLE=api · :3000           index (queueId, status, nextRunAt)
    stateless                  — due scans + lookups, not the worker claim
              │
     2  INSERT Job
        status = SCHEDULED     (code today: even “run now”
        nextRunAt = now        sets SCHEDULED + nextRunAt = now)
        then 201. API done.
        API does not XADD.
              │
              │  no Redis from API
              ▼
       SCHEDULER
    ROLE=scheduler · tick 5s
    health/metrics :3001
              │
     3  SELECT due jobs
        FOR UPDATE SKIP LOCKED
     4  SCHEDULED → QUEUED
        + history row
     5  XADD jobId
              │
              ▼
     REDIS STREAM
     queue:{queueId}
     group djs_workers
              │
     6  XREADGROUP  (one message → one worker)
              ▼
       WORKER × N
    ROLE=worker · scale out
    health/metrics :3002
              │
     7  CLAIM: UPDATE WHERE status = QUEUED
     8  CLAIMED → RUNNING, run executor
     9  COMPLETED  or  FAILED
        (retry / DLQ is designed next;
         worker catch only writes FAILED)

PROMETHEUS → GRAFANA
scrapes /metrics on api :3000, scheduler :3001, worker :3002
dashboard parses the same Prometheus text (no extra BFF)
```

### The nine arrows (what you say as you number them)

1. Client sends `POST /api/v1/jobs` with a JWT **or** an API key.
2. API inserts one `Job` row and returns 201. It never talks to Redis.
3. Scheduler wakes every 5s and selects due `SCHEDULED` jobs with `FOR UPDATE SKIP LOCKED` (batch 1000).
4. Scheduler flips them `SCHEDULED → QUEUED` through the state machine and writes a history row.
5. Scheduler `XADD`s the **job id** (not the payload) onto that queue’s stream.
6. A worker blocks on `XREADGROUP`. Group `djs_workers` gives each **new** message to one worker.
7. Worker claims in Postgres: update only if the row is still `QUEUED`. Zero rows updated = lost race → `XACK` and move on.
8. Worker runs the executor, heartbeats the job every 5s, writes the result.
9. Job ends `COMPLETED` or `FAILED`. Designed next step is retry-with-backoff or DLQ. **Live worker does not call `RetryEngine` yet** — say that if they go one level down.

### If they ask “what about immediate vs cron?”

**Code today:** `JobController.create` always sets `status: SCHEDULED` and `nextRunAt` to now unless the body sent a time. So “run immediately” still waits for the next scheduler tick (up to ~5s), then Redis, then a worker. That is why the drawing has one spine.

**Intended HLD** (docs, not this controller): immediate jobs would insert `QUEUED` and `XADD` from the API, and only delayed/cron would sit in `SCHEDULED`. If you describe the HLD, label it as design, not as this controller.

---

## What each box is

One or two sentences. This is what you say after you finish drawing.

### Client

Next.js ops dashboard · REST · k6

Anything that speaks HTTP. The dashboard **polls** (jobs ~5s, some widgets 3–10s). No WebSocket in v1.

**Say this.** It is a pure client. No BFF of its own, so job logic cannot drift out of the API. Metrics widgets parse `/metrics`; if that endpoint is down, charts die and job lists still work.

### API

`ROLE=api` · Express · stateless · `:3000`

Auth, validation, CRUD. Writes the job row and returns. Global middleware: request id → correlation id → helmet/cors → AsyncLocalStorage context → logs → metrics → JSON. **Auth sits on the routers**, not in that global chain. Bearer JWT for humans, `X-API-Key` for machines.

**Say this.** It is stateless, so I scale it behind a load balancer. The design call in **this code** is that it does not publish to Redis — only Postgres. Workers cannot run until the scheduler has promoted the row.

### PostgreSQL

Source of truth · 37 Prisma models

Every job, state change, execution, DLQ row, worker registry, and the tenancy tree live here. Redis holds nothing that cannot be rebuilt from it.

**Say this.** I chose Postgres over Mongo for ACID transitions, foreign keys, and `SKIP LOCKED` on the **scheduler due-scan**. Worker claiming is a different tool: optimistic `UPDATE … WHERE status = QUEUED`. Do not say skip-locked is how workers grab jobs. That is the HLD picture, not this worker.

### Scheduler

`ROLE=scheduler` · 5s tick · `:3001` health/metrics only

Selects up to 1000 due jobs with `FOR UPDATE SKIP LOCKED`, transitions to `QUEUED`, `XADD`s. Redlock around the tick is a comment, not live. Two schedulers are still safe because skip-locked hands out disjoint rows. `SchedulerLock` table exists as another option.

**Say this.** Split out from the API on purpose — Celery Beat pattern. If the API is buried under REST, cron timing should not drift.

### Redis Stream

One stream per queue · consumer group `djs_workers`

The doorbell, not the store. Key `queue:{queueId}`. Fields are `jobId`. Worker `XACK`s when done (or when the claim lost the race).

**Say this.** Redis Streams instead of RabbitMQ because Redis was already in the stack, and consumer groups **load-balance**: each message goes to **one** consumer, not a fan-out to all of them. Fan-out would be pub/sub or a second group.

### Worker

`ROLE=worker` · N replicas · `:3002` is health/metrics, not job HTTP

Registers `ONLINE`, loops: ensure group exists (`BUSYGROUP` is fine), `XREADGROUP COUNT 1 BLOCK 2000`, claim, execute, ACK. Worker heartbeat every 10s. Job `lastHeartbeat` every 5s while running.

**Say this.** On SIGTERM it goes `DRAINING`, finishes in-flight jobs, then `OFFLINE` — a deploy should not drop work.

### Executor registry

Inside the worker

A map from type → handler: `email`, `pdf`, `webhook`, `data_processing`, `system`, `custom`, `IMMEDIATE`. Lookup is `payload.taskType` or, if missing, `job.type`. All built-ins are simulated delays.

**Say this.** Adding a job type is registering one class. The poll loop does not grow a switch statement.

### State machine

The rule transitions are supposed to obey

`AllowedTransitions` in `job-state-machine.engine.ts`. Illegal edges throw. A successful transition also inserts `JobExecutionHistory`.

**Say this.** Most of the running system goes through that function. Honesty: **create** writes `SCHEDULED` with Prisma directly, so the first status is not a state-machine edge. After that, scheduler and worker use the engine.

### Retry + DLQ

What is **designed** after `FAILED`

`RetryEngine.evaluateFailedJob`: no policy or retries exhausted → DLQ `MAX_RETRIES_EXCEEDED`. Error code not in `retryOnErrorCodes` → DLQ `NON_RETRYABLE_ERROR`. Else backoff (fixed / linear / exponential, cap, optional jitter) and `FAILED → RETRY_WAITING`.

DLQ here is **not** a Redis queue. It is `Job.status = DLQ` plus a `DeadLetterQueue` forensics row (upserted, so re-entry after replay is safe). Replay is `POST /api/v1/jobs/:id/replay` → transactional `DLQ → QUEUED` + `XADD`.

**Say this.** Jitter exists so a mass outage does not retry every job on the same millisecond. The worker `catch` runs `RUNNING → FAILED`, writes the `JobExecution` row, then calls `evaluateFailedJob`. The sweeper backstops heartbeat timeouts and any FAILED job that slipped through.

### Prometheus + Grafana

Every process exposes `/metrics` (33 custom `djs_*` series). Grafana reads Prometheus. The dashboard parses the same exposition format.

**Say this.** Alerts that actually exist: HTTP error rate > 5% over 5m; worker utilization > 95% (add workers); DLQ ingest rate > 0 over 10m. Queue depth and oldest-job-age are good metrics. They are **not** the configured alert rules.

---

## If they push on it

Four follow-ups. Rehearse these.

### “What stops two workers running the same job?”

Two layers. Redis consumer group hands each **new** stream message to one worker. That is only the wake-up. The real guard is the claim: `UPDATE … WHERE id = ? AND status = 'QUEUED'`. One transaction wins (`count = 1`). Everyone else gets `0`, treats it as a lost race, `XACK`s, moves on. Postgres is the source of truth. Skip-locked is **not** this path.

### “What if a worker dies mid-job?”

Heartbeats stop. The scheduler process runs `RecoveryEngine` on intervals: fast sweep every 5s, slow sweep every 5min. `CLAIMED` with `lockedAt` older than the queue's `claimTimeout` (5s default, per-queue via `QueueConfiguration`) → back to `QUEUED` + fresh `XADD` (the dead consumer's pending entry is never reclaimed). `RUNNING` with `lastHeartbeat` older than `heartbeatTimeout` (30s default) → `FAILED` → `RetryEngine`. Stale workers → `OFFLINE` after 30s without `lastSeen`. Slow sweep republishes drifted `QUEUED` notifications and archives terminal jobs past retention.

### “Is it exactly-once?”

No. At-least-once **execution** with a single-winner **claim**. If a worker finishes the side effect and dies before `COMPLETED`, a later sweep can run it again. Executors must be idempotent. Claiming “exactly-once processing” is a red flag.

### “Where does it break first?”

The Postgres primary under claim and history writes, not Redis. Streams only store `jobId`. k6: smoke p95 ~69 ms; short soak 50 VUs p95 ~43 ms; stress toward 1200 VUs, p95 ~3 s and ~1% errors past ~800 VUs. Full 60-minute soak is TBD. Next levers: pool (PgBouncer), indexes, then more workers — workers without IOPS just stampede the primary.

---

## Tiny glossary while you point at the drawing

| Word | Point at | Meaning |
| --- | --- | --- |
| Source of truth | Postgres | Job exists even if Redis is empty |
| Doorbell | Redis stream | Wake a worker; not ownership |
| Claim | Arrow 7 | Optimistic status update |
| Skip locked | Arrow 3 | Scheduler skips rows another tick already locked |
| DLQ | Postgres box | Status + forensics row, not a second stream |
| Drain | Worker box | SIGTERM: finish in-flight, refuse new |

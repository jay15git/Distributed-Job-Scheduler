# High-Level Design (HLD) & Low-Level Design (LLD)

## High-Level Architecture
The system employs a Modular Monorepo architecture to maximize developer velocity while producing isolated, scalable deployment artifacts. 

The architecture consists of:
1. **Frontend**: React SPA deployed globally via edge networks (Vercel).
2. **Backend API**: Stateless Node.js/Express service exposing RESTful JSON endpoints.
3. **Scheduler**: Dedicated Node.js service evaluating cron expressions and moving scheduled jobs to the ready queue.
4. **Worker**: Independent Node.js service continuously polling Redis Streams and claiming jobs via PostgreSQL atomic locks.
5. **Datastore**: PostgreSQL (primary persistent state) and Redis (event bus, distributed locking, caching).

### Architecture Diagram (Mermaid)
```mermaid
graph TD
    Client[Client App/Frontend] -->|REST API| API[Backend API]
    API -->|Write/Config| PG[(PostgreSQL)]
    API -->|Enqueue Event| Redis[(Redis Streams)]
    
    Scheduler[Scheduler Service] -->|Check Crons| PG
    Scheduler -->|Enqueue Event| Redis
    
    Worker1[Worker Node 1] -->|Consume| Redis
    Worker1 -->|Atomic Lock FOR UPDATE| PG
    
    Worker2[Worker Node 2] -->|Consume| Redis
    Worker2 -->|Atomic Lock FOR UPDATE| PG
    
    Grafana[Grafana] -->|Metrics| API
    Grafana -->|Metrics| Worker1
```

## Low-Level Design

### Worker Claiming Mechanism (SKIP LOCKED)
Postgres is the source of truth; Redis Streams are only a wake-up channel.
1. API/scheduler writes the job row (`QUEUED`) and `XADD`s a wake-up entry to `queue:{queueId}`.
2. A worker in consumer group `djs_workers` `XREADGROUP`s the notification —
   the entry is a *signal*, not an assignment; its jobId is ignored.
3. Each poll tick also `XAUTOCLAIM`s pending stream entries idle > 30s,
   recovering wake-ups abandoned by crashed consumers.
4. The worker runs the authoritative claim — one atomic statement that picks
   the highest-priority QUEUED job:
   ```sql
   UPDATE "Job"
   SET status = 'CLAIMED', "lockedBy" = $workerId, "lockedAt" = NOW(), "updatedAt" = NOW()
   WHERE id = (
       SELECT id FROM "Job"
       WHERE status = 'QUEUED' AND "queueId" = $queueId
       ORDER BY priority DESC, "createdAt" ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
   );
   ```
   No row returned → queue already drained (signal was stale); `XACK` and move on.
   A `JobExecutionHistory` row is written for the won claim.

Stale claims self-heal: a job stuck in `CLAIMED` past the queue's `claimTimeout`
(lockedAt-based) is re-queued and republished by the fast sweeper.

### Scheduler Batch Claim (SKIP LOCKED)
The scheduler promotes due jobs (`SCHEDULED`, `RETRY_WAITING` where
`nextRunAt <= NOW()`) inside a real transaction, so `FOR UPDATE SKIP LOCKED`
genuinely serializes replicas (autocommit would release locks on SELECT return):
```sql
SELECT id, "queueId", status FROM "Job"
WHERE status IN ('SCHEDULED','RETRY_WAITING') AND "nextRunAt" <= NOW()
ORDER BY "nextRunAt" ASC
LIMIT $batch
FOR UPDATE SKIP LOCKED;
-- then UPDATE ... SET status='QUEUED' + JobExecutionHistory rows, same tx;
-- XADD notification happens AFTER commit.
```
The cron materializer uses the same pattern on `ScheduledJob`: lock due
schedules, create a `QUEUED` Job row, roll `nextRunAt` forward via cron-parser.

### Recovery Sweeps
* **Fast sweep (~5s)**: CLAIMED past `claimTimeout` → QUEUED + republish;
  RUNNING with stale `lastHeartbeat` → FAILED → RetryEngine;
  unevaluated FAILED jobs → RetryEngine; stale workers → OFFLINE.
* **Slow sweep (~5min)**: republish drifted QUEUED notifications (dedup-safe
  via the claim CAS), purge metrics + worker heartbeats, archive terminal
  jobs past per-queue retention (`jobRetentionDays` / `dlqRetentionDays`).

### Dependency Gating (DAG)
Enqueue with `dependsOn: [parentJobId, ...]` creates the job in `BLOCKED` plus
`JobDependency` edges. Edges only ever point to pre-existing jobs, so cycles
are impossible by construction — no cycle detection needed.

* Worker success path calls `DependencyEngine.releaseDependents(jobId)`:
  each `BLOCKED` child whose parents are now all `COMPLETED` transitions
  `BLOCKED → QUEUED` and gets a fresh `XADD`.
* The fast sweeper runs `cancelOrphans()`: `BLOCKED` children of parents in
  `DLQ`/`CANCELLED`/`ARCHIVED` are cancelled — a DAG with a dead prerequisite
  can never run.
* Enqueue-time validation rejects missing parents (400) and already-dead
  parents (409); if all parents already completed, the child skips `BLOCKED`
  and enqueues directly.

### Job State Machine Diagram
```mermaid
stateDiagram-v2
    [*] --> QUEUED : Enqueue Immediate
    [*] --> SCHEDULED : Enqueue Delayed/Cron
    [*] --> BLOCKED : Enqueue with dependsOn
    SCHEDULED --> QUEUED : Scheduler activates
    BLOCKED --> QUEUED : All parents COMPLETED
    BLOCKED --> CANCELLED : Parent terminated
    
    QUEUED --> CLAIMED : Worker wins SKIP LOCKED claim
    QUEUED --> CANCELLED : User cancel
    CLAIMED --> RUNNING : Execution begins
    CLAIMED --> QUEUED : Claim timeout recovery
    
    RUNNING --> COMPLETED : Success
    RUNNING --> FAILED : Exception thrown
    RUNNING --> CANCELLING : Cancel requested
    CANCELLING --> CANCELLED : Worker acks
    
    FAILED --> RETRY_WAITING : Backoff delay
    RETRY_WAITING --> QUEUED : Scheduler promotes when due
    RETRY_WAITING --> CANCELLED : User cancel
    
    FAILED --> DLQ : Max retries exceeded
    DLQ --> QUEUED : Admin replay
    
    COMPLETED --> ARCHIVED : Retention expired
    CANCELLED --> ARCHIVED : Retention expired
    DLQ --> ARCHIVED : Retention expired
```

### Sequence Diagram: Job Execution
```mermaid
sequenceDiagram
    participant API
    participant Redis
    participant DB as PostgreSQL
    participant Worker
    participant Sweeper as Fast Sweeper
    participant Retry as RetryEngine
    
    API->>DB: INSERT Job (QUEUED, or SCHEDULED if future nextRunAt)
    API->>Redis: XADD JobEvent (immediate jobs only)
    Redis-->>Worker: Wake-up signal (consumer group)
    Worker->>DB: UPDATE Job CLAIMED ... FOR UPDATE SKIP LOCKED ORDER BY priority DESC
    DB-->>Worker: 1 row claimed (0 = signal stale, XACK discard)
    Worker->>DB: UPDATE Job RUNNING + INSERT JobExecution (RUNNING)
    loop every 5s
        Worker->>DB: UPDATE Job.lastHeartbeat
    end
    Worker->>Worker: Execute payload via ExecutorRegistry
    alt Success
        Worker->>DB: UPDATE Job COMPLETED + UPDATE JobExecution (COMPLETED, output)
        Worker->>DB: DependencyEngine: release BLOCKED children (all parents done)
    else Failure
        Worker->>DB: UPDATE Job FAILED + UPDATE JobExecution (FAILED, stackTrace)
        Worker->>Retry: evaluateFailedJob
        alt Retries left & retryable
            Retry->>DB: FAILED -> RETRY_WAITING (nextRunAt = backoff)
            Note over DB: scheduler promotes RETRY_WAITING -> QUEUED when due
        else Exhausted / non-retryable
            Retry->>DB: FAILED -> DLQ + DeadLetterQueue forensics row
        end
    else Worker dies mid-flight
        Sweeper->>DB: stale heartbeat -> FAILED -> RetryEngine
    end
```

### Entity-Relationship Diagram (ERD)
```mermaid
erDiagram
    ORGANIZATION ||--o{ PROJECT : "contains"
    ORGANIZATION ||--o{ USER : "members"
    PROJECT ||--o{ QUEUE : "has"
    QUEUE ||--o{ JOB : "manages"
    JOB ||--o{ JOB_EXECUTION : "logs"
    WORKER ||--o{ WORKER_HEARTBEAT : "emits"
    JOB ||--o| DEAD_LETTER_QUEUE : "moves to"
```

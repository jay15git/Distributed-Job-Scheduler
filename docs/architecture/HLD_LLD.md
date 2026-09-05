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

### Worker Claiming Mechanism (Atomic Locking)
To guarantee idempotent execution, the Worker service relies on a two-step claim process:
1. Receives notification of a pending job via Redis Stream.
2. Executes a Postgres transaction:
   ```sql
   UPDATE "Job"
   SET status = 'CLAIMED', "lockedAt" = NOW(), "lockedBy" = $1
   WHERE id = (
       SELECT id FROM "Job"
       WHERE status = 'QUEUED' AND "queueId" = $2
       ORDER BY priority DESC, "createdAt" ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
   )
   RETURNING *;
   ```

### Job State Machine Diagram
```mermaid
stateDiagram-v2
    [*] --> QUEUED : Enqueue Immediate
    [*] --> SCHEDULED : Enqueue Delayed/Cron
    SCHEDULED --> QUEUED : Scheduler activates
    
    QUEUED --> CLAIMED : Worker locks job
    CLAIMED --> RUNNING : Execution begins
    
    RUNNING --> COMPLETED : Success
    RUNNING --> FAILED : Exception thrown
    
    FAILED --> RETRY_WAITING : Backoff delay
    RETRY_WAITING --> RUNNING : Retry attempts left
    
    FAILED --> DLQ : Max retries exceeded
    
    COMPLETED --> ARCHIVED : TTL Expired
    DLQ --> ARCHIVED : TTL Expired
```

### Sequence Diagram: Job Execution
```mermaid
sequenceDiagram
    participant API
    participant Redis
    participant DB as PostgreSQL
    participant Worker
    
    API->>DB: INSERT Job (status: QUEUED)
    API->>Redis: XADD JobEvent (QueueID)
    Redis-->>Worker: Stream Event Trigger
    Worker->>DB: SELECT FOR UPDATE SKIP LOCKED
    DB-->>Worker: Claimed Job Row
    Worker->>DB: INSERT JobExecution (status: RUNNING)
    Worker->>Worker: Execute payload
    alt Success
        Worker->>DB: UPDATE JobExecution (status: COMPLETED)
        Worker->>DB: UPDATE Job (status: COMPLETED)
    else Failure
        Worker->>DB: UPDATE JobExecution (status: FAILED, store stackTrace)
        Worker->>DB: UPDATE Job (increment retry, status: FAILED)
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

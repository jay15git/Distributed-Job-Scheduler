# Job Scheduler Interview Guide

## System Architecture

**Q: Why a modular monorepo instead of microservices?**
A: A full microservice architecture (with API Gateways, service registries, etc.) introduces operational overhead that is unnecessary for a job scheduling platform. The modular monorepo approach allows us to share types, schemas, and configurations (the `shared/` package) while still compiling independent deployment artifacts (Frontend, Backend, Worker, Scheduler).

**Q: Why separate the Scheduler from the Backend?**
A: Following the Celery Beat pattern, the Scheduler's sole responsibility is evaluating cron expressions and triggering scheduled jobs at exact intervals. If the backend is under heavy load serving REST requests, it shouldn't impact the precision of cron scheduling.

## Concurrency & Redis

**Q: How does the system prevent two workers from claiming the same job?**
A: Two layers. The Redis consumer group gives each stream notification to exactly one worker — but that's only a wake-up. The real guard is an atomic compare-and-swap on the job row: `UPDATE "Job" SET status='CLAIMED' WHERE id=? AND status='QUEUED'`. Exactly one transaction gets `count=1`; losers XACK and move on. Separately, the *scheduler* claims due-job batches with `FOR UPDATE SKIP LOCKED` inside a transaction, which also makes scheduler replicas safe.

**Q: Why use Redis Streams instead of RabbitMQ?**
A: Redis is already required for caching, distributed rate limiting, and Redlock distributed locks. Using Redis Streams (with Consumer Groups) for our event bus avoids introducing an entirely new infrastructural dependency (RabbitMQ), keeping the deployment topology lean while still getting the benefits of a robust message broker.

## Database Design

**Q: Why PostgreSQL?**
A: Job scheduling relies on state transitions and relational integrity (e.g., ensuring a job cannot be in both QUEUED and RUNNING states simultaneously). Postgres provides strong ACID guarantees and the critical `SKIP LOCKED` functionality which is notoriously difficult to implement correctly in NoSQL databases like MongoDB.

## Reliability & Fault Tolerance

**Q: What is a Dead Letter Queue (DLQ)?**
A: When a job fails, the system applies a retry strategy (e.g., exponential backoff). If the job continues to fail and exhausts its maximum allowed retries, it is moved to the DLQ. This prevents poison-pill jobs from clogging up the queue while allowing developers to inspect the failure summary and manually replay the job later.

**Q: How do you handle Worker crashes?**
A: Two heartbeat layers. The worker process updates `Worker.lastSeen` every 10s — 30s stale means `OFFLINE`. Per-job, the executing worker refreshes `Job.lastHeartbeat` every 5s. A fast sweeper (running in the scheduler process every 5s) reaps `CLAIMED` jobs past the queue's `claimTimeout` back to `QUEUED` with a fresh stream notification, and `RUNNING` jobs with stale heartbeats go to `FAILED` → the retry engine decides backoff-retry or DLQ.

## Security

**Q: How are API Keys managed?**
A: API Keys are stored as bcrypt hashes in the database (`keyHash`), similar to passwords. We never store the plain-text key. When a user creates a key, we display it once. The keys also support granular string-based scopes (e.g., `['job:write', 'queue:read']`) to limit their capabilities.

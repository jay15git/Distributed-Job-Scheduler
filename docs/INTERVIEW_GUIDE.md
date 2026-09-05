# Job Scheduler Interview Guide

## System Architecture

**Q: Why a modular monorepo instead of microservices?**
A: A full microservice architecture (with API Gateways, service registries, etc.) introduces operational overhead that is unnecessary for a job scheduling platform. The modular monorepo approach allows us to share types, schemas, and configurations (the `shared/` package) while still compiling independent deployment artifacts (Frontend, Backend, Worker, Scheduler).

**Q: Why separate the Scheduler from the Backend?**
A: Following the Celery Beat pattern, the Scheduler's sole responsibility is evaluating cron expressions and triggering scheduled jobs at exact intervals. If the backend is under heavy load serving REST requests, it shouldn't impact the precision of cron scheduling.

## Concurrency & Redis

**Q: How does the system prevent two workers from claiming the same job?**
A: The system uses PostgreSQL atomic locking: `SELECT FOR UPDATE SKIP LOCKED`.
This ensures that when a worker queries for the next available job, the row is locked exclusively for that transaction, and other concurrent workers automatically skip that row and grab the next available one.

**Q: Why use Redis Streams instead of RabbitMQ?**
A: Redis is already required for caching, distributed rate limiting, and Redlock distributed locks. Using Redis Streams (with Consumer Groups) for our event bus avoids introducing an entirely new infrastructural dependency (RabbitMQ), keeping the deployment topology lean while still getting the benefits of a robust message broker.

## Database Design

**Q: Why PostgreSQL?**
A: Job scheduling relies on state transitions and relational integrity (e.g., ensuring a job cannot be in both QUEUED and RUNNING states simultaneously). Postgres provides strong ACID guarantees and the critical `SKIP LOCKED` functionality which is notoriously difficult to implement correctly in NoSQL databases like MongoDB.

## Reliability & Fault Tolerance

**Q: What is a Dead Letter Queue (DLQ)?**
A: When a job fails, the system applies a retry strategy (e.g., exponential backoff). If the job continues to fail and exhausts its maximum allowed retries, it is moved to the DLQ. This prevents poison-pill jobs from clogging up the queue while allowing developers to inspect the failure summary and manually replay the job later.

**Q: How do you handle Worker crashes?**
A: Workers emit heartbeats. If a worker fails to send a heartbeat within a threshold, the system flags it as OFFLINE. The Scheduler or a dedicated cleanup job then finds all `RUNNING` jobs assigned to that `workerId`, transitions them back to `QUEUED` (or increments the retry count), and clears the lock.

## Security

**Q: How are API Keys managed?**
A: API Keys are stored as bcrypt hashes in the database (`keyHash`), similar to passwords. We never store the plain-text key. When a user creates a key, we display it once. The keys also support granular string-based scopes (e.g., `['job:write', 'queue:read']`) to limit their capabilities.

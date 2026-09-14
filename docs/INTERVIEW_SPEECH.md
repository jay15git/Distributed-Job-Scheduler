# Interview speech — Distributed Job Scheduler

This is what you **say**. The study guide (`INTERVIEW_STUDY.md`) is what you **study**. Do not read tables at them. Talk like you built it and you know where the code is unfinished.

**How to use this.** Practice out loud. Each numbered beat is one answer. If they stay high-level, stop after Beat 1–3. If they go deep, jump to the matching beat. Never dump the whole file in one sitting.

**Night-before order.** Pitch → restaurant → claiming (wiki vs code) → failure/DLQ → auth one-liner → “what I would ship next.”

---

## Beat 1 — “Tell me about the project” (20 seconds)

I built a background job platform. Client apps dump work they should not do inside an HTTP request — emails, PDFs, cron, retries. PostgreSQL is the source of truth for job state. Redis Streams wake workers. A separate scheduler promotes delayed and cron jobs. Workers execute. The dashboard is an ops UI, not the engine.

---

## Beat 2 — Stretch that to two minutes if they nod

The product problem is simple. If “send invoice” generates a PDF and emails it inside the same HTTP request, the user waits and the web process is busy with slow work. A background job is that work recorded as data — send this email to this address — and executed later by another process. The HTTP request only records the work and returns. That is the category: a queue plus workers.

This repo is that category as a multi-tenant SaaS. Many companies share one deployment, isolated by organization and project. It is **distributed** in a specific sense: many worker processes, possibly on many machines, all looking at the same pool of jobs. The hard constraint is two workers must never execute the same job. Double email, double charge, double webhook. That constraint is why we have Postgres status transitions, Redis consumer groups, optimistic updates, heartbeats, and recovery sweeps.

What it is not: it is not a production email product. The built-in executors — email, pdf, webhook, and so on — are simulators with timeouts. Interviewers should care about enqueue, claim, execute, retry, dead-letter, crash recovery, auth, tenancy, and metrics. The Next.js dashboard is an operations console. Operators watch queues and workers. It does not schedule jobs itself.

I use a restaurant picture for thirty seconds, then drop it. The client placing an order is `POST` to enqueue a job. The kitchen ticket is a row in the Postgres `Job` table. The bell is Redis `XADD`. One cook grabbing one ticket is one worker claiming one job. Cooking is `RUNNING` with heartbeats. If the cook collapses, recovery sees a stale heartbeat and requeues or fails the job. If the dish is inedible after N retries, it goes to a dead letter parking lot. The manager screen is the Next.js UI.

---

## Beat 3 — Stack, said as tools with jobs, not a shopping list

API, scheduler, and workers are Node processes. Node fits because we spend our time waiting on Redis, SQL, and HTTP, not crunching PDFs — those executors are mocks anyway. We scale by running more processes, not by making one process multithreaded. TypeScript plus a `shared/` package keeps frontend, API, and workers on the same job shape.

The API is Express, not Nest. Routes, controllers, services, repositories. Express is thin; control flow is visible. Nest would give us a DI container we did not need. Tradeoff is more boilerplate. HTTP adapters stay thin so I can test `RetryEngine` without Express.

The dashboard is Next.js App Router and React. React Query caches HTTP. Tailwind and Recharts for the ops screens. Axios to the **same** REST API and the **same** Prometheus `/metrics` text Grafana uses. There is no private BFF. If metrics are down, charts die and job lists still work. That is graceful degradation.

PostgreSQL is a relational database: tables, foreign keys, SQL. Job state needs **ACID**. Atomicity so you do not leave `CLAIMED` without history if both writes are in one transaction. Consistency so status is a real `JobStatus` enum. Isolation so two workers do not both think they own a row. Durability so a crash does not erase a commit. If Redis dies empty, jobs still exist in Postgres. Redis can be rebuilt. Postgres is not optional cache.

Redis is in-memory. We use it three ways. Streams as the message bus — the doorbell. Coordination — Redlock is **documented**, and in this codebase the Redlock call is a comment, not live. Fast counters and rate limits — the natural fit if we add API rate limiting later. One line: Postgres remembers the truth. Redis shouts that work is ready so workers are not hammering `SELECT` every ten milliseconds.

A Redis Stream is an append-only log. `XADD` on `queue:{queueId}` with a `jobId`. `XGROUP CREATE` makes a consumer group named `djs_workers`. `XREADGROUP` with `>` means give me messages this group has never seen. `XACK` means I finished this wake-up, do not redeliver it to me. The group load-balances **notifications**. It is not ownership of the job. Ownership is Postgres status `CLAIMED`.

Prisma is the ORM. Schema in `schema.prisma`, migrations, typed client. Skip-locked SQL still uses `$queryRaw`. Zod validates HTTP bodies at runtime because TypeScript types vanish. Docker Compose runs Postgres, Redis, a one-shot migrate container, API, scheduler, worker, Prometheus, Grafana. Same backend image, `ROLE` env chooses api, scheduler, worker, or migrate. Scale workers with compose scale, not eight images. pnpm/npm workspaces: one repo, packages for backend, frontend, worker, scheduler, shared, database.

Prometheus scrapes `/metrics` every fifteen seconds. Grafana graphs them. k6 is load tests — virtual users, smoke through soak.

---

## Beat 4 — Four processes, two stores, how it scales

On disk it is a **modular monorepo**: independently deployable processes, shared source. `backend/` is Express and also the source of `WorkerService` and `SchedulerEngine`. `worker/` and `scheduler/` are thin packages so you can ship separate artifacts. `frontend/` is Next. `shared/` is types and Zod, not a process. `database/` is Prisma. `monitoring/` is Prometheus and Grafana.

Follow the arrows. Client talks REST to the API. API writes Postgres and `XADD`s Redis. Scheduler skip-locks due rows in Postgres, moves `SCHEDULED` to `QUEUED`, then `XADD`. Workers `XREADGROUP`, then optimistic claim in Postgres, then execute. Prometheus scrapes API, scheduler, workers. Grafana queries Prometheus. The client never talks to workers. Workers never enqueue over HTTP. Grafana never writes jobs.

If Postgres dies, the product is down. If Redis dies, workers go quiet until streams are republished. Jobs are not lost. The slow recovery sweep is **designed** to republish drifted `QUEUED` jobs; in code that Redis check is still a stub. I would say that out loud.

High-level design is boxes, scale, and failure. Low-level is the SQL and the state machine. Paper SRS: API p95 under 200 ms, claim under 100 ms, ten thousand plus queued jobs, a thousand submissions a minute, a hundred plus workers. Intent is exactly-once via atomic transitions; in practice we are at-least-once with idempotent handlers. k6: smoke p95 around 69 ms, short soak 50 VUs p95 around 43 ms, stress to 1200 VUs p95 around 3 seconds and about one percent errors past 800 VUs. Full sixty-minute soak is marked TBD.

What scales independently is the point of splitting processes. More HTTP and dashboard users: more **stateless** API replicas behind a load balancer. Session truth is in Postgres; any replica verifies JWT. More delayed and cron becoming due: more scheduler replicas or a bigger tick batch. Due-row claim uses `FOR UPDATE SKIP LOCKED`, so two schedulers do not promote the same row. Leader lock with Redlock is documented, not implemented. More jobs to execute: more workers. That is the main knob. Consumer group plus Postgres claim. More rows: bigger Postgres, then read replicas for the dashboard. Claiming needs the primary. More wake-up traffic: Redis memory, cluster later. Streams only carry `jobId`. Payload lives in Postgres, so Redis stays cheap.

Stateless means the process does not keep the only copy of job state in RAM. Kill an API pod; the next one serves. Workers have in-memory `activeJobs` and heartbeats, but the job row is in Postgres. If the worker dies, recovery uses that row.

Why not one giant Node process? A slow job blocks the event loop, HTTP p99 explodes, cron fires late. You cannot scale workers without scaling API. A deploy that restarts HTTP also restarts in-flight work unless you drain. Celery split Beat from workers for the same reason. We copied that.

Locally, migrate waits for Postgres healthy, API waits for migrate, scheduler and worker wait for API healthy. Live probe is process up. Ready probe is Postgres and Redis reachable. Kubernetes uses that to restart versus stop sending traffic.

Multi-tenancy is data isolation, not a database per tenant in v1. Organization, then project, then queue with concurrency and retry policy, then jobs. Queries scoped by org and project. RBAC and API key scopes enforce it. Scaling tenants is more rows and indexes, not more microservices. Noisy neighbor: per-queue concurrency, `rateLimit` on queue config, worker `maxConcurrency`. A huge tenant can get a dedicated queue and a worker pool with `supportedQueues`.

Health: `GET /health/live`, `/health/ready`, `/metrics`, `/version`.

---

## Beat 5 — Why we picked this stack (ADRs)

Do not say “we chose Postgres.” Say problem, options, pick, tradeoff, how we scale with that pick.

**Postgres over Mongo.** Jobs have a strict lifecycle. Queues belong to projects belong to orgs. You need transactions and locks. Mongo is great for flexible JSON. It does not give you `FOR UPDATE SKIP LOCKED`. You would invent a lock collection and still lose races. A job scheduler is a state machine over rows. That is relational and transactional, not a document problem. The write primary is the bottleneck. Mitigation: Redis for notification, payload cap around 1 MB, index `(queueId, status, nextRunAt)`, archive old jobs.

**Redis Streams over RabbitMQ.** Workers must not poll Postgres in a tight loop — that is a thundering herd of selects. RabbitMQ is an excellent broker with exchanges and its own DLQ. Cost is another cluster and another skill set. We already run Redis for locks and counters. Streams give consumer groups and `XACK`. Streams are the doorbell. Postgres is the ticket. We did not put PDF bytes in Redis. Rabbit has richer routing; we have one stream per queue.

**Express over Nest.** Clean architecture: controllers extract params, services own rules, repositories own SQL. Swap Express later if we want.

**Prisma over TypeORM.** Schema file is the contract. `$queryRaw` for skip-locked. `runInTransaction` wraps `prisma.$transaction` with timeout and isolation.

**Modular monorepo over microservices.** The four runtimes share the job state machine. Networked microservices would turn every transition into HTTP and you would still need a shared DB or a saga. One repo, package boundaries, independent deploy via `ROLE`. Scale workers first, then read replicas, only then extract a service if a team owns it.

**Redis for coordination.** Intended: Redlock around scheduler ticks, atomic rate-limit tokens. Honesty: `processScheduledJobs` has a comment that we would acquire Redlock. The safety net that **is** implemented is skip-locked on due jobs. Two schedulers can tick; they still promote disjoint rows. There is also a `SchedulerLock` table if we wanted DB-side locks.

---

## Beat 6 — Claiming (this is the centerpiece)

If they only give you five minutes after the pitch, come here.

The wiki and the HLD draw a classic Postgres work-queue, and the worker really runs it: `UPDATE` a job to `CLAIMED` where the id comes from a subquery — `QUEUED` jobs for this queue, `ORDER BY priority DESC, createdAt ASC`, `FOR UPDATE SKIP LOCKED`, `LIMIT 1`.

What skip locked means, said to a human. Two workers want a queued row. `FOR UPDATE` locks rows until commit. Without skip locked, the second worker **waits**. Waiting workers pile up. With skip locked, the second worker **does not wait**. It skips the locked row and takes the next free queued row. Combined with that order, high priority first, then older jobs — a priority queue, FIFO within a priority. Interviewers know this from skip-locked blog posts.

**And that is exactly what the worker runs.** The design: Redis Stream entries are only wake-up signals — they carry a jobId, but the worker ignores which job and runs the authoritative claim: `UPDATE Job SET CLAIMED, lockedBy, lockedAt WHERE id = (SELECT id FROM Job WHERE QUEUED AND this queue ORDER BY priority DESC, createdAt ASC FOR UPDATE SKIP LOCKED LIMIT 1)`. One statement, atomic, no collisions. If the queue is already drained — another worker claimed everything between the `XADD` and our wake-up — the claim returns nothing and we just `XACK` the signal. Strict priority ordering comes free because the claim query orders by it.

**Worker loop in full.** Register online, heartbeat every ten seconds, listen for SIGTERM. Each tick: `XAUTOCLAIM` on each queue stream to steal pending entries idle over thirty seconds — a crashed consumer's unacked wake-ups get recovered. Then `XREADGROUP` block two seconds for fresh signals. For every signal, run the skip-locked claim, write a QUEUED→CLAIMED history row, then `CLAIMED` to `RUNNING`, look up the executor, run the payload, `COMPLETED` or `FAILED`, job heartbeat every five seconds on `lastHeartbeat`, finally `XACK`.

**The scheduler uses the same primitive in batch form.** Select up to a thousand due `SCHEDULED`/`RETRY_WAITING` rows `FOR UPDATE SKIP LOCKED` **inside a real transaction** — in autocommit the locks would release when the select returns and be decorative. Promote each to `QUEUED`, then `XADD` after commit.

So the honest one-liner: **Postgres is the source of truth, Redis is the pager.** A stale page never corrupts state because the DB claim decides everything.

Visibility timeout: how long `CLAIMED` or `RUNNING` may sit before we assume the worker died. Each queue's `QueueConfiguration` carries `claimTimeout` and `heartbeatTimeout`; the sweeper COALESCEs the per-queue value over the schema defaults — configurable per queue, sane defaults out of the box.

Exactly-once versus at-least-once. True exactly-once is extremely hard; the network can drop “I finished.” We guarantee at most one **concurrent** execution. We do not promise the handler never runs twice across a crash. Handlers must be idempotent. The custom executor can throw on `payload.shouldFail` to test retries. It is not a payment API.

Priority: strict, and real. The claim query orders `priority DESC, createdAt ASC` — stream arrival order is irrelevant because the DB picks the job, not the message. A signal for a low-priority job still causes the highest-priority queued job to be claimed.

Happy path in speech: client posts an immediate job. API inserts `QUEUED`, `XADD`s, returns 201. The signal wakes a worker, which runs the skip-locked claim and takes the row. Claimed to running. Execute. Success: completed. Throw: failed, and the retry engine evaluates inline — backoff to `RETRY_WAITING` or park in the DLQ. Then `XACK`.

---

## Beat 7 — Scheduler

Immediate jobs do not need a clock. Delayed means run in ten minutes. Cron means every day at nine. Those rows sit `SCHEDULED` with `nextRunAt` in the future. Somebody must notice due time. That is `startScheduler` every five seconds, `processScheduledJobs`. If that loop lived in the API, a traffic spike delays cron. Separate process: isolated event loop, deploy, and scale.

Tick: batches of a thousand so we do not lock millions of rows. Skip-locked select of due scheduled rows. Empty batch, stop. Each row in parallel: state machine to queued, then `XADD`. Repeat.

Do not pretend the tick parses cron inside `processScheduledJobs` unless you have read that path. Due jobs are `nextRunAt` less than or equal to now. Recurrence lives on scheduled-job records. The tick promotes due `Job` rows.

Metrics: ticks, tick duration, processed, failed. HA: skip-locked disjoint batches are implemented. Redlock so only one tick runs is documented, not wired. It would reduce duplicate work even though skip-locked already makes it safe.

---

## Beat 8 — States, retries, DLQ, recovery, executors

If any function could set any status, you get nonsense — completed back to running. `AllowedTransitions` is a graph. Illegal edges throw before SQL. Every successful transition writes `JobExecutionHistory`: previous, next, actor, reason. That is the audit trail the jobs UI shows.

Walk the lifecycle in words. Enqueue immediate starts `QUEUED`. Delayed or cron starts `SCHEDULED`. Scheduler promotes scheduled to queued. Worker wins queued to claimed, then running. Success is completed. Exception is failed. User can cancel queued or scheduled; running can go cancelling then cancelled. Failed either waits to retry or goes to DLQ. Retry waiting becomes queued when the delay elapsed. DLQ can replay to queued or archive. Completed, cancelled, and DLQ can archive. Archived is terminal.

I can rattle the allowed matrix if they want it, but I will not recite it unprompted. Know: failed only goes to retry waiting or DLQ. DLQ only to archived or queued. Claimed can go back to queued on claim timeout.

**Retry.** Designed path: `evaluateFailedJob`. Load job, queue, retry policy. No policy, or retry count at max retries or policy max attempts: DLQ, reason `MAX_RETRIES_EXCEEDED`. If `retryOnErrorCodes` is non-empty and this code is not in the list: DLQ, `NON_RETRYABLE_ERROR`. Empty list means retry all codes. Otherwise bump retry count, set `nextRunAt`, failed to retry waiting.

Backoff: fixed delay is always initial delay. Linear is initial times attempt plus one. Exponential is initial times multiplier to the attempt. Cap at max delay. Jitter, if on, adds random plus or minus jitter percent times delay. Jitter exists so ten thousand jobs that fail together do not retry in the same millisecond. That is a retry storm. Who moves retry waiting to queued? Same idea as delayed jobs: `nextRunAt`. A scheduler or retry sweep should promote them. Legal edge exists.

**DLQ, slowly, because they will ask.**

Without a DLQ, a job throws, you retry, it throws forever. That is not a busy queue. That is a **poison pill** — work that will never succeed. Missing `to` on an email. A bug in the PDF executor. HTTP 400 — retrying a bad request does not help.

If you leave it queued, workers keep claiming it, wasting CPU and flooding logs. A naive FIFO list would stall everything behind it. Our workers skip via consumer groups and optimistic claim, so we do not stall the whole queue like a linked list would, but we still burn worker slots. Ops cannot tell flaky network from garbage if both just say failed.

A dead letter queue is the parking lot for work we **stop retrying**. Still stored. Not eligible to claim. Humans inspect it.

In Kafka or SQS, a DLQ is often a second queue. Replay copies the message back. Our source of truth is Postgres, so the DLQ is **not** a Redis stream named dlq. It is the same job row with status `DLQ`, which workers never claim, plus a sidecar `DeadLetterQueue` row: which queue, last worker, retry count, machine reason, exception JSON, a recovery hint, optional AI analysis, when we parked it. Two records so the job table stays lifecycle and ops can query poison jobs without stuffing huge JSON on every job.

Two give-up stories. Exhausted retries: transient errors you did retry, budget gone — SMTP down, three backoffs, still failing. Non-retryable: retrying is wrong. Validation, 400, unauthorized. Empty retry-on codes means retry everything until max. Non-empty plus unknown code means DLQ even at retry count zero.

Do not mix words. Failed means the last run threw and a decision is pending. Retry waiting means we will try again at `nextRunAt`. DLQ means we will not try again unless a human replays.

Replay is quarantine, not delete. Fix payload or code, then DLQ to queued. Metrics define resolution as replayed or discarded. Discard is DLQ to archived. Dashboard KPI is DLQ depth. Alert: ingest rate greater than zero over ten minutes means a bad deploy or a bad producer.

Honesty: the retry path is wired end to end. The worker catch does running to failed inside the same failure block, records the `JobExecution` row with the stack trace, then calls `evaluateFailedJob`. The sweeper's heartbeat-timeout recovery also hands its FAILED jobs to the retry engine, and a third sweep pass evaluates any FAILED job that slipped through — crash between transition and evaluation cannot strand a job. Replay is a real endpoint: `POST /jobs/:id/replay` transitions DLQ back to QUEUED in a transaction, resets the retry budget, writes history, and republishes `XADD`. DLQ re-entry is safe — the forensics row upserts.

**Thirty-second DLQ if they only want the definition.** A DLQ is where we put jobs we will not retry automatically — poison pills, non-retryable errors, or retries exhausted. Here it is not a Redis queue. Postgres status DLQ makes workers ignore the row, and a dead-letter table stores why we parked it. That protects workers and lets humans inspect and replay. Transients go failed to retry waiting with backoff. Only the give-up path is DLQ.

**Recovery.** Kill minus nine leaves jobs claimed or running. The scheduler process runs a fast sweep every five seconds: claimed with `lockedAt` older than the queue's `claimTimeout` — per-queue config, five-second default — goes back to queued and gets a fresh `XADD`, because the original stream entry is stuck pending on the dead consumer. Running with `lastHeartbeat` older than the queue's `heartbeatTimeout` goes to failed and straight into the retry engine. A third pass evaluates any leftover failed jobs, and a fourth marks workers offline after thirty seconds without `lastSeen`. Worker also writes heartbeat rows every ten seconds — CPU, RAM, current jobs, rolling average job time, failure rate — pruned past twenty-four hours. Status online, draining on SIGTERM — finish in-flight, refuse new — then offline, terminated. Slow sweep on five minutes: queued idle more than five minutes is Redis drift — republish `XADD`, dedup-safe because the claim is an optimistic compare-and-swap. Metrics purge older than seven days, heartbeat rows older than a day, terminal jobs archived past per-queue retention — seven days, thirty for DLQ.

Graceful shutdown: `isDraining` stops the poll loop. Wait until active jobs are zero. Then offline. Kubernetes sends SIGTERM and waits termination grace.

**Executors.** Interface with a type and `execute`. Registry is a map. Duplicate type throws. Missing type throws. Built-ins are simulated: email, pdf, webhook, data processing, system, custom which can fail, immediate. Strategy pattern: the worker does not switch on type. New task type is a new class and register. No worker-loop change.

---

## Beat 9 — API shape

HTTP hits middleware, then router with auth, controller, service, repository, Postgres. `ROLE=api` listens on 3000. Controllers should not embed SQL. Repositories should not know status codes. Separation of concerns.

Middleware order matters. Request id from header or new UUID, echoed back. Correlation id groups related jobs in a workflow; jobs store it. Helmet and CORS. `AsyncLocalStorage` so logs get request, org, user without threading arguments through every function. Pino HTTP: four xx warn, five xx error, redacts password, token, api key. Metrics histograms, skipping `/metrics` and `/health` so scrapes do not pollute. JSON body. Routers under `/api/v1`. Error handler: `AppError` to status, unknown to 500. `express-async-errors` forwards rejected promises.

Typed errors: 400 validation, 401 auth, 403 forbidden, 404, 409 conflict, 429, 500. Envelope is success true with data, or success false with error code and request id.

Routes worth naming: health and metrics; auth register login refresh logout me sessions verify-email forgot reset; orgs projects queues; `POST /queues/{id}/jobs` with types immediate, delayed, scheduled, cron; workers list; Swagger. Humans send `Authorization: Bearer` JWT. Machines send `X-API-Key`.

Domain rules they poke. Org create: creator is org admin. Invite is a 32-byte token, SHA-256 stored, seven-day expiry. Project has env production, development, testing; creator project admin. Queue status: active is enqueue and consume. Paused is enqueue, no consume. Draining is no enqueue, finish existing, **cannot jump draining straight to active**. Then disabled or archived before delete. Queue metrics: minute snapshots, purge after seven days. API keys: prefix `djs_proj_`, 32 random bytes, SHA-256, show the raw key **once**, scopes enum.

Zod: passwords min eight with upper, lower, number, special. Shared create-job and create-queue schemas, pagination.

---

## Beat 10 — Auth, said as a story

Two audiences. Humans get JWT sessions. Machines get API keys.

Register: unique email, bcrypt the password, transaction creates an unverified user, hashed email token, audit log. Email sends the **raw** token. Verify hashes what arrived, matches, marks verified. Unverified login is 403.

Login: rate limited. If locked until is in the future, reject. Bcrypt compare. Fail increments attempts; at five, lock fifteen minutes, audit lockout. Success resets counters, creates a session and a hashed refresh token, returns an access JWT of about fifteen minutes with user id, session id, and `tokenVersion`.

Refresh tokens belong to a **family** — the lineage from one login. Each refresh revokes the old token and inserts a new one with the same family id. If the client sends a refresh that is already revoked or expired, that is reuse detection — stolen token, or two tabs racing badly. We revoke the **entire family** and the sessions. Attacker and victim both log in again. Steal-and-replay kills the family.

`tokenVersion` on the user is a global kill switch. Password reset or change increments it and revokes all sessions and refresh tokens. Middleware requires JWT version to equal the database. Old access tokens die immediately, not in fifteen minutes.

`requireAuthentication`: verify access token, session hash exists and not revoked, user not deleted or locked, version matches, attach `req.user`, bump last activity. Then role checks and org membership must match params or body. Roles: super admin, org admin, project admin, developer, viewer.

API keys again: prefix, SHA-256, not revoked, not expired, not soft-deleted. Usage is recorded async so the request is not blocked on telemetry.

**Wiki trap.** Some docs say API keys are bcrypt. That is wrong. Code: **bcrypt for user passwords**, **SHA-256 for API keys, refresh tokens, and email-verify tokens**. Passwords need slow hashing against guessing. Keys are already high-entropy random; lookup by hash must be fast.

---

## Beat 11 — Data, indexes, dashboard

Transactions use `runInTransaction`. UUIDv4 primary keys: no `/users/1` enumeration, nodes generate ids without a central sequence. Slightly larger indexes than bigints — accepted. Soft delete is `deletedAt` null means live. Partial indexes on live rows are documented as future work. Delete org cascades to projects, queues, jobs. Request logs set null on key delete so history survives.

Core shape: org has projects and members. User joins via membership. Project has queues. Queue has jobs and an optional retry policy. Job has executions, history, maybe one dead-letter row. Worker emits heartbeats.

Indexes: claiming and due scans must not sequential-scan a million job rows. `(queueId, status, nextRunAt)` serves worker and scheduler filters. The HLD also wants `(queueId, status, priority DESC, createdAt)` for the skip-locked picker in the **design** SQL. Partial `(status, nextRunAt)` where scheduled for the due scan. Queue metrics by queue and timestamp. Session and refresh token hashes for auth. Unique member of user plus org for RBAC.

An index, from zero: a B-tree on the side so Postgres finds by queue and status without reading every row. Writes get a bit slower. For a job table, claim speed wins.

Enums I can name: job status and job type — immediate, delayed, scheduled, cron, plus some workflow-ish types in the schema that are not all first-class engines — queue status, worker status, retry strategy, role, API key scope.

Dashboard: Next 16, React 19, Tailwind 4, shadcn, React Query, Recharts. Sidebar for dashboard, jobs, queues, workers, and admin screens. Polling jobs makes a derived activity feed. **No WebSocket in v1.** Destructive actions confirm. Metrics: parse Prometheus exposition in the browser in `metrics-parser.ts`. Same numbers Grafana uses.

---

## Beat 12 — Observability, tests, CI, what I would build next

Metrics prefix `djs_`: queue depth, wait histogram, oldest job age, drain and enqueue rates, jobs running. Worker claimed, completed, failed, claim latency, execution duration, heartbeat, utilization, workers online. Scheduler ticks. Retry and DLQ counters, DLQ depth. HTTP counts and duration. DB and Redis gauges. Build info.

Alerts: HTTP error rate over five percent in five minutes. Worker utilization over ninety-five percent — add workers, that is starvation. DLQ ingest greater than zero over ten minutes.

Logs: pino with request mixin. Correlation id ties enqueue to execute.

Tests: Vitest. Integration on live Postgres and Redis. Auth, queues, worker claim and execute, scheduler due jobs, retry to DLQ. Concurrency as a script. k6: smoke one VU; API twenty VUs p95 under 200 ms; enqueue fifty VUs p95 under 100 ms; worker end-to-end; spike to ten thousand VUs; stress to 1200; soak fifty VUs one hour.

CI on push and PR to main, Node 20 and 22: lint and tsc, build Prisma and packages, tests with Postgres and Redis services, OpenAPI validate, npm audit high, compose smoke and k6. Docker is multi-stage node 22 alpine, production install on the runner, same image, ROLE selects the process.

If they ask what I would build next, in this order: Postgres advisory-lock leader election if scheduler replicas need serialization; a Redis ZSET delay queue or timing wheel if delayed-job volume outgrows the index scan; and multi-step durable workflows — saga orchestration à la Temporal — which is a different layer than the single-level DAG gating we already have.

Hardest bug class: distributed claim races and stale workers. The state machine, optimistic update, and recovery exist because of that.

---

## If they ask these questions — short spoken answers

**How does this scale to a hundred workers?** Workers are the knob. Stateless API replicas. Redis group partitions notifications. Postgres claim is an indexed update on job id where still queued. Add Postgres IOPS and indexes before infinite workers or they stampede the primary.

**What is the bottleneck?** Write primary for job updates and history inserts. Then Redis memory if you put payloads on the stream. Then the scheduler tick if millions become due in one second — batch of a thousand helps.

**Why not Kafka?** Kafka is a durable log cluster. We need a work queue plus relational state. Kafka plus Postgres is valid at huge volume. Redis Streams are enough for this SRS and we already run Redis.

**Why not only LISTEN/NOTIFY?** Notify is best-effort, no consumer group, no persistence of the notification. Fine for a single box. Not a worker pool.

**Microservices?** Independently deployable processes, shared package, one database for the job aggregate. Not networked job-service versus auth-service on day one.

**How would you shard?** By queue id or organization id: dedicated Postgres and worker pools. Streams already keyed by queue. Do not shard by random job id — recovery and listing scatter.

**How do you prevent double execution?** Design doc: skip-locked picker. Code path for workers: Redis group plus updateMany where status is still queued. Scheduler due-scan does use skip locked. I can draw both.

**Optimistic versus pessimistic?** Pessimistic holds a row lock. Optimistic updates if status still matches. Workers are optimistic. Scheduler batch is pessimistic skip-locked.

**Consumer group versus claim?** Group is who gets the wake-up. Claim is who owns the row. Postgres always wins.

**Duplicate XADD?** Second worker’s transition fails, XACK, exit. History stays consistent.

**Worker SIGKILL?** Heartbeats stop. Fast sweep: claimed older than five seconds back to queued; running older than thirty seconds to failed. At-least-once: handler may run again, so idempotency.

**Why jitter?** Desynchronize retries after a mass outage.

**Redis flush?** Jobs still in Postgres. Need republish of queued job ids onto streams. Slow sweep is the designed place; implementation is stubbed. I would ship that before calling Redis optional.

**Two schedulers, split brain?** Skip locked on due rows. Redlock would reduce wasted ticks; not wired.

**Why UUIDs?** No enumeration, generate without a sequence. Index cost accepted.

**Prisma and raw SQL?** ORM for CRUD. Raw for skip-locked and recovery sweeps.

**Paused versus draining?** Paused: still enqueue, workers stop. Draining: no new jobs, finish existing. Draining cannot go straight to active.

**JWT versus API key?** JWT is a human session: short access, rotating refresh, family reuse detection, tokenVersion. API key is a machine: SHA-256, scopes, shown once.

**Stolen refresh?** Reuse of a rotated token revokes the family.

**Password reset?** tokenVersion plus plus, revoke all sessions.

**Multi-tenant leak?** Organization membership middleware plus project scoping on queries. API keys bound to a project.

**Live updates on the dashboard?** Polling jobs, not WebSockets, in v1.

**p95, VUs, those k6 numbers?** A virtual user is a simulated client. Latency is time to respond. p95 means ninety-five percent of requests were faster than that number; the slow tail is the other five percent. Error rate is failed requests over total. We care about p95 more than average because averages hide the pain users feel.

---

## Closing if they give you the last word

This is a background job platform with Postgres as truth and Redis as the pager. The interesting part is claiming: workers treat stream entries as wake-up signals and run an atomic `FOR UPDATE SKIP LOCKED` claim ordered by priority — Redis never decides anything. The scheduler does the same claim in batch form inside a real transaction. Failure is a state machine — retry with backoff and jitter, or park in a Postgres DLQ, not a Redis DLQ, with a replay endpoint. Cron is a materializer: `ScheduledJob` rows roll `nextRunAt` forward and spawn real Job rows. DAG gating is built in — a job with `dependsOn` parents parks in `BLOCKED` and releases when the last parent completes, or cancels if a parent dies. Auth is bcrypt passwords, SHA-256 keys, refresh families, and tokenVersion. What I would build next: Postgres advisory-lock leader election if I ever serialize scheduler replicas, and a timing wheel if delayed-job volume outgrows the index scan.

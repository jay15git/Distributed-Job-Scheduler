# Software Requirements Specification (SRS)

## 1. Introduction
The Distributed Job Scheduler is a multi-tenant platform for reliable background job processing. PostgreSQL is the authoritative job store; Redis Streams carry wake-up notifications. It executes immediate, delayed, cron-driven, and DAG-gated jobs across horizontally scaled workers.

## 2. Non-Functional Requirements (NFRs)
- **Delivery semantics**: at-least-once dispatch (a crash mid-flight re-queues the job) with exactly-once state transitions via atomic `FOR UPDATE SKIP LOCKED` claims and CAS-guarded transitions. Exactly-once *execution* is not claimed — executors must be idempotent.
- **Performance**: measured results live in `backend/test/load/` reports; targets are p95 API latency < 100ms and claim latency < 100ms under moderate load. Any number quoted elsewhere must trace to a measured run.
- **Scalability**: stateless API/worker/scheduler roles scale horizontally. Multiple scheduler replicas coordinate through `SchedulerLock` leases; SKIP LOCKED keeps correctness even if leadership overlaps.
- **Reliability**: recovery sweepers repair claim timeouts, dead workers (heartbeat expiry), unevaluated failures, stream drift, missed DAG releases, and orphaned children. Bounded Redis streams via `XADD MAXLEN`.
- **Availability**: per-role health/readiness probes (`/health/live`, `/health/ready`), graceful drain on SIGTERM.
- **Security**: JWT sessions + project-scoped API keys (`X-API-Key`, hashed at rest). All resource routes enforce organization membership; write paths require ORG_ADMIN/PROJECT_ADMIN/DEVELOPER roles.

## 3. Functional Requirements
- **Multi-Tenancy**: Organization → Project → Queue hierarchy with enforced isolation and RBAC.
- **Queue Management**: per-queue concurrency limits, execution timeouts, enqueue rate limits, depth caps, payload caps, retry-policy attachment.
- **Job Lifecycle**: QUEUED, SCHEDULED, BLOCKED, CLAIMED, RUNNING, CANCELLING, COMPLETED, FAILED, RETRY_WAITING, DLQ, CANCELLED, ARCHIVED — every transition recorded in JobExecutionHistory.
- **Scheduling**: delayed jobs via `nextRunAt`; recurring jobs via `ScheduledJob` cron materialization.
- **Retries**: pluggable RetryPolicy (fixed/linear/exponential backoff + jitter, retryable error-code allowlist) evaluated by the RetryEngine; exhausted jobs land in DLQ with forensics and can be replayed.
- **Cancellation**: cooperative — QUEUED/SCHEDULED cancel immediately, in-flight jobs enter CANCELLING and are observed via worker heartbeat or reaped by the sweeper.
- **Execution Tracking**: JobExecution rows per attempt (duration, error, stack trace) plus full state-transition history.
- **Observability**: Prometheus metrics (queue depth, claim/exec latency, worker utilization, retries, DLQ) with a provisioned Grafana dashboard; correlation-ID logging; worker heartbeats.

## 4. Current Limitations (honest)
- Executors are in-process plugin mocks (`console.log`/sleep) — the registry interface is real, webhook/email delivery is demo-only.
- Email delivery is stubbed: verification/reset tokens are returned in responses only when dev-token mode is enabled.
- Throughput/scale numbers apply to the tested local Docker topology only.

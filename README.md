# Distributed Job Scheduler

![Docker](https://img.shields.io/badge/docker-ready-blue.svg)
![Tests](https://img.shields.io/badge/integration_tests-42%20passing-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A distributed job scheduling engine powered by Node.js, PostgreSQL, and Redis Streams, with a Next.js operations dashboard.

Postgres owns job state (`FOR UPDATE SKIP LOCKED` claiming); Redis Streams are wake-up signals only. Delivery is at-least-once with exactly-once state transitions.

## Features

- **Job engine**: immediate, delayed (`nextRunAt`), cron-recurring, and DAG-gated jobs with idempotency keys and cooperative cancellation.
- **Resilience**: retry policies (fixed/linear/exponential + jitter), DLQ with replay, recovery sweepers for claim timeouts, dead workers, stream drift, and orphaned DAG children.
- **Noisy-neighbor controls**: per-queue concurrency limits, enqueue rate limits, queue-depth caps, payload-size caps, and execution timeouts.
- **Multi-tenancy**: org → project → queue isolation enforced by middleware; JWT sessions plus project-scoped API keys (`X-API-Key`, SHA-256 at rest, one-time token display).
- **Scheduler HA**: leader election via `SchedulerLock` leases; correctness preserved by SKIP LOCKED even during leadership flaps.
- **Observability**: Prometheus metrics + provisioned Grafana dashboard; correlation-ID logging; worker heartbeats.

## Local Development

```bash
docker-compose up -d        # postgres, redis, api, worker, scheduler, prometheus, grafana
npm run seed                # demo org/project/queue + seed user
```

### Access Points

- **Backend API**: `http://localhost:3000/api/v1` — Swagger UI at `/api-docs`
- **Operations Dashboard**: `http://localhost:3002` (`cd frontend && npm run dev`)
- **Grafana**: `http://localhost:3001` (admin/admin, dashboard auto-provisioned)
- **Prometheus**: `http://localhost:9090`

### Auth in development

No SMTP is configured; `EMAIL_MODE=dev` (compose default) makes
register/forgot-password responses return `devVerificationToken` /
`devResetToken` directly for local development.

## Testing

```bash
cd backend
DATABASE_URL=... REDIS_URL=... npx vitest run   # 42 integration tests (live Postgres + Redis)
npm run load:smoke                              # k6 smoke test (Dockerized k6)
```

## Documentation

- [Project Overview](PROJECT_OVERVIEW.md) — architecture and design decisions
- [HLD/LLD](docs/architecture/HLD_LLD.md) — component-level design
- [API spec](docs/api/openapi.yaml) — served live at `/api-docs`
- [SRS](docs/architecture/SRS.md) — requirements and honest limitations

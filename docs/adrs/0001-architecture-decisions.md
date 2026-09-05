# Architecture Decision Records (ADRs)

## ADR 001: PostgreSQL over MongoDB
**Date:** 2026-07-16
**Context:** A robust, reliable data store is required for tracking jobs, queues, user configurations, and audit logs.
**Decision:** We chose PostgreSQL instead of MongoDB.
**Rationale:** Job scheduling systems heavily rely on transactional integrity, atomic locks (e.g., `SELECT ... FOR UPDATE SKIP LOCKED`), and highly relational data (Users -> Organizations -> Projects -> Queues -> Jobs -> Executions). PostgreSQL's ACID compliance and robust locking mechanisms make it far superior to MongoDB for this specific use case.

## ADR 002: Redis Streams over RabbitMQ
**Date:** 2026-07-16
**Context:** The system needs a message broker to distribute jobs from the API to the independent Worker processes.
**Decision:** We chose Redis Streams.
**Rationale:** While RabbitMQ is excellent for enterprise messaging, Redis Streams provides a lighter, faster, and highly adequate alternative that integrates perfectly with our existing Redis caching and distributed locking infrastructure. Redis Streams supports consumer groups, which allows us to horizontally scale workers effectively without introducing the operational overhead of a separate RabbitMQ cluster.

## ADR 003: Express.js over NestJS
**Date:** 2026-07-16
**Context:** The backend API requires a Node.js framework.
**Decision:** We chose Express.js over NestJS.
**Rationale:** Express.js provides a minimalist, highly performant foundation that allows us to implement our own strict Clean Architecture and SOLID patterns without being constrained by the heavily opinionated, Angular-like DI container of NestJS. This ensures the codebase remains transparent and easier to debug for high-throughput performance requirements.

## ADR 004: Prisma ORM over TypeORM
**Date:** 2026-07-16
**Context:** We need an ORM to interact with PostgreSQL in TypeScript.
**Decision:** We chose Prisma ORM.
**Rationale:** Prisma provides superior type safety, an intuitive schema definition language, and excellent migration tooling. Unlike TypeORM, which can suffer from synchronization issues and complex decorator-based entity definitions, Prisma generates a bespoke, fully type-safe client that significantly reduces runtime errors.

## ADR 005: Modular Monorepo over Microservices
**Date:** 2026-07-16
**Context:** The system consists of a Frontend, Backend API, Worker, and Scheduler.
**Decision:** We chose a Modular Monorepo approach.
**Rationale:** A true microservice architecture requires significant operational overhead (API Gateways, Service Discovery, distributed tracing complexity). A modular monorepo allows us to share types, schemas, and logic (via the `shared/` package) seamlessly, while still producing independently deployable artifacts (Backend Docker image, Worker Docker image). This strikes the perfect balance between development velocity and production scalability.

## ADR 006: Redis for Distributed Coordination
**Date:** 2026-07-16
**Context:** The system needs to prevent duplicate cron scheduling and coordinate rate limits across multiple worker nodes.
**Decision:** We chose Redis.
**Rationale:** Redis provides blazingly fast in-memory operations ideal for the Redlock algorithm (distributed locking) and atomic rate limiting. It acts as the high-speed synchronization layer, leaving PostgreSQL free to handle persistent state and complex queries.

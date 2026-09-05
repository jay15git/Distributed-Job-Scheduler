# Distributed Job Scheduler - Project Overview

## 1. Introduction

This project is a high-performance, fault-tolerant distributed job scheduler designed to manage background jobs across multiple worker nodes. It consists of a robust backend implemented with Node.js and a modern, responsive frontend built with Next.js and Tailwind CSS.

## 2. Architecture

### 2.1 Backend (`v1.0.0-backend`)

The backend is built around a Redis-backed queue system, ensuring high throughput and reliability.

*   **Core Technologies**: Node.js, Express, Prisma, Redis, PostgreSQL.
*   **Queue Mechanism**: Uses Redis Streams and Sorted Sets for reliable job queuing, delayed execution, and exactly-once processing guarantees.
*   **Worker Management**: Workers register themselves and send periodic heartbeats to the orchestrator. Stale workers are automatically detected, and their jobs are reassigned.
*   **Observability**: Exposes Prometheus metrics (`/metrics`) for deep operational insights, tracking queue depth, processing latency, failure rates, and worker health.

### 2.2 Frontend (Operations Dashboard)

The frontend is a dedicated operational control center for the scheduler. It is designed specifically to interface with the frozen `v1.0.0-backend` API without introducing any proxy endpoints.

*   **Core Technologies**: Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, React Query, Recharts.
*   **Design Philosophy**: The frontend acts purely as a client to the backend. It truthfully represents the backend's capabilities without mocking data or inventing functionality.
*   **Key Features**:
    *   **Real-time Dashboard**: Aggregates Prometheus metrics into a single unified dashboard displaying KPIs, worker status, and queue activity.
    *   **Job Investigation**: Allows operators to drill down into specific jobs, view execution timelines, and inspect raw JSON payloads.
    *   **Worker Monitoring**: Displays live utilization and heartbeat status for all registered compute nodes.
    *   **Queue Management**: Provides controls to pause and resume queues, allowing operators to manage system load during incidents.
    *   **Administrative Interface**: Includes settings and organizational management capabilities.

## 3. Key Design Decisions

### 3.1 Prometheus Parsing in the Browser

To adhere to the constraint of not modifying the `v1.0.0-backend`, the frontend parses the raw Prometheus exposition format (`/metrics`) directly in the browser. 

*   **Why?** This avoids introducing a backend-for-frontend (BFF) proxy, keeping the architecture simple and ensuring the frontend consumes the exact same observability layer as other external monitoring tools.
*   **Implementation**: A dedicated `metrics-parser.ts` handles the conversion of raw strings into strongly typed models (e.g., `WorkerMetric`, `QueueMetric`), providing a clean data layer for UI components.

### 3.2 Derived Activity Feed

Instead of relying on a dedicated web-socket event stream (which the backend does not provide), the dashboard derives an activity feed from actual job state transitions by polling the `/api/v1/jobs` endpoint.

*   **Why?** This provides a realistic representation of system activity without requiring complex event-sourcing infrastructure on the backend.

### 3.3 Graceful Degradation

The frontend is designed to handle failures gracefully. If the Prometheus endpoint is unreachable, the metrics-driven widgets will display an error state, but the rest of the dashboard (e.g., Recent Jobs, Activity Feed) will continue to function normally.

## 4. Operational Best Practices

The frontend is designed with operational best practices in mind:

*   **Consistent UX Patterns**: Uses standard summary cards, side drawers for details, and consistent status indicators across all views.
*   **Clear Indicators**: Components like the `RefreshIndicator` and live heartbeat timers ensure operators always know if they are looking at fresh data.
*   **Destructive Action Protection**: All destructive actions (e.g., cancelling a job, pausing a queue) are protected by a confirmation dialog to prevent accidental clicks.

## 5. Future Enhancements (Post v1.0)

*   **Authentication & Authorization**: Full integration with an identity provider and role-based access control (RBAC).
*   **Audit Logging**: Comprehensive logging of all administrative actions.
*   **API Key Management**: Secure generation and management of API keys for programmatic access.

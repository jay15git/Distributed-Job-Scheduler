# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-17

### Added
- Complete backend implementation with Redis Streams and PostgreSQL.
- Support for IMMEDIATE, SCHEDULED, and CRON job types.
- Automatic stale worker detection and job reassignment.
- Integrated retries with configurable backoff strategies.
- Dead Letter Queue (DLQ) support for permanently failed jobs.
- Full Prometheus metrics exposition (`/metrics`).
- Operations Dashboard frontend (Next.js 16, App Router).
- Real-time KPIs, Worker Status, and Queue Activity monitoring.
- Job investigation tools (Execution Timeline, Payload Inspector).
- Administrative interface placeholders for future expansion.

### Changed
- Refactored frontend to consume Prometheus metrics directly in the browser to avoid backend modification.

### Fixed
- Fixed k6 load testing script configuration.
- Resolved race conditions in job locking mechanism during worker scale-up.

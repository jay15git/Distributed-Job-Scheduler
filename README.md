# Distributed Job Scheduler

![Build Status](https://github.com/username/distributed-job-scheduler/actions/workflows/ci.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A highly scalable, distributed job scheduling engine powered by Node.js, PostgreSQL, and Redis Streams, complete with a modern Next.js operations dashboard.

## Features

- **Queue Management**: Configurable queues with concurrency, timeouts, and rate limiting.
- **Job Engine**: Execute IMMEDIATE, SCHEDULED, and CRON jobs.
- **Resilience**: Integrated Retries, Dead Letter Queue (DLQ), and gracefully-degrading Worker pools.
- **Observability**: Full Prometheus & Grafana stack out-of-the-box, with trace-ID (correlation) logging.
- **Operations Dashboard**: A modern, real-time control center built with Next.js 16 and Tailwind CSS for monitoring and managing the scheduler.

## Local Development

```bash
docker-compose up -d
```

### Access Points

- **Backend API**: `http://localhost:3000/api/v1`
- **Prometheus Metrics**: `http://localhost:3000/metrics`
- **Operations Dashboard**: `http://localhost:3002` (Run `cd frontend && npm run dev`)
- **Grafana**: `http://localhost:3001` (admin/admin)

## Documentation

For a detailed overview of the architecture and design decisions, please see the [Project Overview](PROJECT_OVERVIEW.md).

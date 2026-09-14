# Performance Report

This report is generated from K6 benchmark outputs executed against the Docker Compose stack. 
It captures baseline performance and validates system stability under simulated load.

## 1. SMOKE Test
*Purpose: Verify end-to-end functionality of API, Scheduler, Worker, and Observability stack.*
- **P95 Latency**: 69.27 ms
- **Average Latency**: 23.71 ms
- **Error Rate**: 0.00%
- **Max VUs**: 1

## 2. STRESS Test
*Purpose: Find the breaking point of the system by ramping up to 1200 VUs over 7 minutes.*
- **P95 Latency**: 3053.57 ms
- **Average Latency**: 1972.10 ms
- **Error Rate**: 1.00%
- **Max VUs**: 1200

*Observation: The system successfully handled load up to roughly ~800 VUs before beginning to experience HTTP timeout errors. The 1% error rate is within expectations for a limit-finding stress test.*

## 3. SOAK-SHORT Test (Validation)
*Purpose: A brief 2-minute validation of the soak test script at 50 VUs before committing to a full 60-minute soak test run.*
- **P95 Latency**: 43.16 ms
- **Average Latency**: 23.80 ms
- **Error Rate**: 0.00%
- **Max VUs**: 50

## 4. SOAK Test (Full 60-min)
*Purpose: Verify long-term stability and identify potential memory leaks by running 50 VUs continuously for 60 minutes.*

> [!NOTE] 
> **Pending Execution**: This section is reserved for the full 60-minute soak test results. The test should be executed manually before the final release sign-off.

- **P95 Latency**: [TBD]
- **Average Latency**: [TBD]
- **Error Rate**: [TBD]
- **Max VUs**: 50
- **Memory Leak Identified?**: [TBD]

---

## 5. Post-Security-Hardening Run (2026-09-14)

*Environment: local Docker infra (Postgres 15, Redis 7) + tsx dev processes — 1 API, 1 worker, 1 scheduler. Mock executors (~500ms sleep for IMMEDIATE). Org-scoped RBAC + session validation now active on every request (adds ~3 DB reads per call vs. the pre-hardening baseline).*

### Enqueue throughput (`enqueue.js`, 50 VUs, 2m40s)
- **51,469 jobs enqueued** — 321 jobs/s sustained
- **Error rate: 0.00%** (0 failed of 51,473 requests)
- **p95 enqueue latency: 263 ms** (avg 136 ms)
- Observation: enqueue outpaced single-worker drain; ~50k QUEUED backlog formed and was purged after the run. This is the correct backpressure boundary — enqueue stays healthy while workers scale independently.

### End-to-end latency (`worker.js`, 20 VUs, 1m40s)
- **939 jobs completed**, 0% HTTP errors
- **API p95: 38 ms** (enqueue + status polls)
- **E2E p95 (enqueue → COMPLETED): ~2.16 s** — floor is dominated by the 500 ms mock executor plus the 500 ms status-poll granularity in the test harness, not platform latency.

### Notes for resume claims
- Use "321 enqueues/s sustained, 0% errors, p95 263 ms at 50 VUs" for enqueue throughput.
- Use "API p95 ~38 ms" for API latency; do not present e2e latency as API latency.
- E2E latency depends on executor cost; with the 500 ms mock executor, e2e p95 ~2.2 s.
- Prior ~800 VU stress ceiling predates RBAC/org-scoping; re-run `stress.js` before quoting it.

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

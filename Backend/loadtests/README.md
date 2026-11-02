# Load Test Results (Mid-Project Review)

All tests ran on one local Windows development machine (Node.js, MongoDB and Redis on localhost, and
k6 on the same PC), against the `fleetdash_load` database, with `LOG_REQUESTS=false`.

## 1. Ingestion: POST /api/telemetry/ingest

Scenario: 50 vehicles, k6 script `ingest.k6.js`, run with `node loadtests/run-steps.js 2000` and
`STEP_DURATION=30s`. Each run has a 10-second warm-up (the rate grows from 100 to 2,000 requests per
second so connections are opened gradually, like a real fleet), then holds 2,000 requests per second for
30 seconds. The achieved rate and the p95 are measured on the steady 30 seconds only. Failed and dropped
requests are counted over the whole run, including the warm-up.

| Run | Target rate | Achieved (steady) | p95 | Failed | Dropped | Accepted | Stored in DB | Clean |
|---|---|---|---|---|---|---|---|---|
| 1 | 2,000 req/s | 2,000 req/s | 92 ms | 0 (0.0%) | 0 | 70,380 | 70,380 | YES |
| 2 | 2,000 req/s | 2,000 req/s | 72 ms | 0 (0.0%) | 0 | 70,390 | 70,390 | YES |
| 3 | 2,000 req/s | 2,000 req/s | 65 ms | 0 (0.0%) | 0 | 70,360 | 70,360 | YES |

- Zero data omission: every request answered with 201 is stored in MongoDB (accepted = stored), in all three runs.
- "Clean" means: full rate reached, nothing dropped by k6, p95 under 500 ms, under 1% failed, accepted = stored.
- The result is repeatable: three runs in a row were clean.

### What had to change to measure 2,000 requests per second

An earlier attempt on the same PC lost requests (about 3 to 4% failed, "connection refused") even though no
accepted reading was ever lost. The causes were on the test side, and they were fixed:

- k6 now creates one virtual user per request per second in advance (`PRE_VUS` = `RATE`), so it can keep the rate.
- A 10-second warm-up (`RAMP`) opens connections gradually. Opening about 2,000 connections in the first
  second made Windows refuse some of them.
- The server accepts more waiting connections (`SERVER_BACKLOG`, default 4096) and keeps idle connections
  open for 65 seconds, so clients reuse them.
- `run-steps.js` now prints the error reasons and counts "no answer", 5xx and other failures separately.

## 2. Batch ingestion: POST /api/telemetry/ingest-batch

Scenario: 5 requests/s, 300 readings per request (offloaded to a parse worker thread), 15 s,
k6 script `batch.k6.js`.

| Requests | Failed | p95 | Readings sent | Readings ingested |
|---|---|---|---|---|
| 76 | 0 (0.00%) | 65 ms | 22,800 | 22,800 |

## 3. Database query speed (MongoDB bucket pattern)

Script `scripts/benchmarkQueries.js LOAD-001`, 20 runs each, index
`{ vehicleId: 1, bucketStartTime: -1, count: 1 }`.

| Query | avg | p95 | min |
|---|---|---|---|
| Find newest open bucket (used by every ingest) | 1.03 ms | 1.35 ms | 0.67 ms |
| Latest 5 buckets for a vehicle (history) | 1.04 ms | 1.50 ms | 0.70 ms |

`explain('executionStats')`: server execution 1 ms, 1 index key examined, 1 document
examined. Target was under 5 ms.

## How to run

Run these from the `Backend` folder (Windows Command Prompt).

```
:: 1. clean old test data
node scripts/countLoadReadings.js --delete

:: 2. start the server without request logging
set LOG_REQUESTS=false
npm start

:: 3. in a second window: ingest test (10 s warm-up + 30 s at 2,000 per second; it also checks accepted = stored)
set STEP_DURATION=30s
node loadtests/run-steps.js 2000

:: 4. optional: run all steps (500, 1000, 1500, 2000) and print one table
node loadtests/run-steps.js

:: 5. batch test
set RATE=5
set BATCH_SIZE=300
set DURATION=15s
k6 run loadtests/batch.k6.js

:: 6. database speed
node scripts/benchmarkQueries.js LOAD-001

:: 7. clean up
node scripts/countLoadReadings.js --delete
```

Close the vehicle simulator before running a load test, because it adds extra traffic.
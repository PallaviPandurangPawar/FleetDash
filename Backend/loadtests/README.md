# Load Test Results (Mid-Project Review)

All tests ran on one local Windows development machine (Node.js, MongoDB and Redis on localhost, and
k6 on the same PC), against the `fleetdash_load` database, with `LOG_REQUESTS=false`.

## 1. Ingestion: POST /api/telemetry/ingest

Scenario: 50 vehicles, k6 script `ingest.k6.js`, run with `node loadtests/run-steps.js 2000` and
`STEP_DURATION=30s`. Each run has a 10-second warm-up (the rate grows from 100 to 2,000 requests per
second so connections are opened gradually, like a real fleet), then holds 2,000 requests per second for
30 seconds. The achieved rate and the p95 are measured on the steady 30 seconds only. Failed and dropped
requests are counted over the whole run, including the warm-up.

Results with **hourly buckets** (one bucket per vehicle per clock hour, safety cap 1,000 readings):

| Run | Target rate | Achieved (steady) | p95 | Failed | Dropped | Accepted | Stored in DB | Clean |
|---|---|---|---|---|---|---|---|---|
| 1 | 2,000 req/s | 2,000 req/s | 210 ms | 0 (0.0%) | 0 | 70,396 | 70,396 | YES |
| 2 | 2,000 req/s | 2,000 req/s | 161 ms | 0 (0.0%) | 0 | 70,397 | 70,397 | YES |
| 3 | 2,000 req/s | 2,000 req/s | 186 ms | 0 (0.0%) | 0 | 70,390 | 70,390 | YES |
| 4 (k6 started directly) | 2,000 req/s | 2,000 req/s | 163 ms | 0 (0.0%) | 0 | 70,389 | 70,389 | YES |

- A run with 50 vehicles creates 100 buckets (about 2 per vehicle, because the cap of 1,000 is reached within the hour). With 100 readings per bucket it created at least 700.
- Before hourly buckets (100 readings per bucket) the same test gave a p95 of 65 to 92 ms. Larger buckets cost more per write, so p95 is now higher, but still far below the 500 ms limit.

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

## 3. Database query speed (MongoDB hourly buckets)

Script `scripts/benchmarkQueries.js LOAD-001`, 20 runs each, after a 2,000 req/s load run, index
`{ vehicleId: 1, bucketStartTime: -1, count: 1 }`. The vehicle had 2 buckets and 1,362 readings.

| Query | avg | p95 | min |
|---|---|---|---|
| Find the open bucket of one clock hour (used by every ingest) | 1.75 ms | 2.67 ms | 1.09 ms |
| Latest 5 buckets for a vehicle (history) | 1.40 ms | 1.79 ms | 1.10 ms |

`explain('executionStats')`: server execution 0 ms, 1 index key examined, 1 document
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
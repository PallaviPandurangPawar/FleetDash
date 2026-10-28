# Load Test Results (Mid-Project Review)

All tests ran on a local development machine (Node.js v24, MongoDB and Redis on localhost),
against the `fleetdash_load` database, with `LOG_REQUESTS=false`.

## 1. Ingestion: POST /api/telemetry/ingest

Scenario: constant arrival rate for 30 s, 50 vehicles, k6 script `ingest.k6.js`.

| Target rate | Achieved | Requests | Failed | avg | p95 | max | Accepted | Stored in DB |
|---|---|---|---|---|---|---|---|---|
| 2,000 req/s | 1,956 req/s | 59,068 | 0 (0.00%) | 261 ms | 428 ms | 852 ms | 59,068 | 59,068 |
| 1,500 req/s | 1,480 req/s | 44,575 | 0 (0.00%) | 162 ms | 261 ms | 578 ms | 44,575 | 44,575 |

- Zero data omission: every request answered with 201 is stored in MongoDB (accepted = stored).
- Thresholds: error rate under 1% and p95 under 500 ms were met in both runs.
- At 2,000 req/s k6 reported 934 dropped iterations. These are requests k6 itself could not
  start on the test machine, they were never sent to the server. The server lost no data.

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

:: 3. in a second window: ingest test
set RATE=2000
set DURATION=30s
k6 run loadtests/ingest.k6.js 2>nul

:: 4. compare "readings_accepted" in the k6 summary with the stored total
node scripts/countLoadReadings.js

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
# Weekly Progress Log

Status legend: Done / In progress / Not started. This log covers the backend; the frontend is tracked in the frontend team's notes.

## Week 1: Core Setup (Backend) - Done

- Express server with a clear structure (routes, controllers, services, models, middleware) and environment-based configuration
- Reusable `worker_threads` pool with a task queue and automatic restart of crashed workers; a second pool validates large batches
- MongoDB Bucket Pattern: `TelemetryBucket` (hourly buckets: one vehicle per clock hour, safety cap of 1,000 readings, pre-calculated summary updated with atomic operators), `Vehicle` model, one compound index
- Ingestion API (single and batch), vehicle API, history and bucket statistics, validation middleware
- Group-commit buffer: readings arriving within 10 ms are written together, each request answered after its data is stored
- k6 load-testing scripts (single ingest, batch ingest, health) and helper scripts

## Week 2: Caching and Transport (Backend) - Done

- Redis Pub/Sub between ingestion and the real-time server (separate publisher and subscriber connections)
- Real Redis Cluster in Docker Compose (3 primaries and 3 replicas), cluster-aware client with a setting to choose single or cluster mode (`REDIS_MODE`)
- Cluster state and nodes in `GET /api/health`; tests that stop a node and freeze a primary (its replica takes over) while live updates keep flowing
- Socket.io server with ArrayBuffer-style binary delivery: one message every 100 ms, 8-byte header and 56-byte records
- Updates dropped when no client is connected; Socket.io settings in `config/socket.js`; clean shutdown
- Batch uploads also reach live clients
- Automated tests of the full path: HTTP request, Redis, Socket.io, decoded binary message

## Mid-Project Review Checklist

| Requirement | Result |
|---|---|
| Database index queries under 5 ms | **Done.** With hourly buckets: 1.75 ms average, 95th percentile 2.7 ms, index used (1 key, 1 document examined) |
| 2,000 requests per second ingestion with zero data omission | **Done.** With hourly buckets: 2,000 per second for 30 s after a 10-second warm-up, 0 failed, 0 dropped, 95th percentile 161 to 210 ms, accepted = stored in every run (for example 70,396 = 70,396) |
| Repeatable | **Done.** Three clean runs in a row (95th percentile 210, 161 and 186 ms), plus a fourth run started directly with k6 (163 ms) |
| Redis cluster for Pub/Sub | **Done.** Real Redis Cluster in Docker Compose (3 primaries, 3 replicas) with a single/cluster switch. All 294 tests pass against it; live updates keep flowing when a node stops or a primary freezes and its replica takes over (no gap longer than 15 seconds, checked by the test) |
| Batch ingestion | 22,800 readings sent = 22,800 stored, 95th percentile 65 ms |
| Frontend ready for Canvas integration | Frontend team |

Details and how to repeat the tests: `Backend/loadtests/README.md`.

## Week 3: Geospatial Logic (Backend) - Done

- Turf.js geofence engine: bounding-box test first, exact point-in-polygon second
- Enter and exit detection per vehicle and geofence; alerts stored in MongoDB and pushed live over Socket.io
- Geofence CRUD API and alerts API (filters, paging, summary, acknowledge)
- Every reading is checked in time order, also for batch uploads; late readings cannot turn the state back
- Analytics API on worker threads: trip summary and safety score, geofence check
- Canvas optimization (requestAnimationFrame): Frontend team

## Week 4: Testing and Deployment (Backend) - Done

- Jest and Supertest: 294 tests in 21 suites (unit and integration), about 91 percent statement coverage, run against a separate test database; 6 of the tests need the Redis Cluster and run in their own CI job
- Bugs found and fixed by the tests: crashes on `endTime`-only queries, 500 instead of 400 for invalid database input, unsafe paging values, malformed geofence polygons, missed geofence re-entry inside one write group, batch uploads skipping alerts
- Seed script (`npm run seed`, `seed:reset`) and a rewritten backend README
- Docker: backend image plus MongoDB and Redis, with health checks (`docker compose up -d --build`)
- GitHub Actions CI: runs all tests with real MongoDB and Redis, smoke-tests the Docker stack, and runs the whole test suite against a real Redis Cluster on every push
- Refine and polish the UI: Frontend team

## Final Review Checklist

| Requirement | Result |
|---|---|
| Robust data pipeline that parses and routes many concurrent spatial streams | **Done** (see the mid-project results and the architecture document) |
| Unit test coverage with Jest and Supertest | **Done.** 294 tests, about 91 percent coverage |
| CI/CD pipeline | **Done.** `.github/workflows/ci.yml` |
| Deployment | **Done.** Docker Compose stack, tested on a PC and in CI |
| Steady 60 FPS viewport with thousands of live objects | Frontend team |
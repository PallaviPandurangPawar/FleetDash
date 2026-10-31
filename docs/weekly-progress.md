# Weekly Progress Log

Status legend: Done / In progress / Not started. This log covers the backend; the frontend is tracked in the frontend team's notes.

## Week 1: Core Setup (Backend) - Done

- Express server with a clear structure (routes, controllers, services, models, middleware) and environment-based configuration
- Reusable `worker_threads` pool with a task queue and automatic restart of crashed workers; a second pool validates large batches
- MongoDB Bucket Pattern: `TelemetryBucket` (up to 100 readings per document, pre-calculated summary updated with atomic operators), `Vehicle` model, one compound index
- Ingestion API (single and batch), vehicle API, history and bucket statistics, validation middleware
- Group-commit buffer: readings arriving within 10 ms are written together, each request answered after its data is stored
- k6 load-testing scripts (single ingest, batch ingest, health) and helper scripts

## Week 2: Caching and Transport (Backend) - Done

- Redis Pub/Sub between ingestion and the real-time server (separate publisher and subscriber connections)
- Socket.io server with ArrayBuffer-style binary delivery: one message every 100 ms, 8-byte header and 56-byte records
- Updates dropped when no client is connected; Socket.io settings in `config/socket.js`; clean shutdown
- Batch uploads also reach live clients
- Automated tests of the full path: HTTP request, Redis, Socket.io, decoded binary message

## Mid-Project Review Checklist

| Requirement | Result |
|---|---|
| Database index queries under 5 ms | **Done.** About 1 ms average, 95th percentile 1.5 ms, index used (1 key, 1 document examined) |
| 2,000 requests per second ingestion with zero data omission | **Done.** 59,068 requests in 30 s (about 1,956 per second), 0 failed, 95th percentile 428 ms, 59,068 accepted = 59,068 stored |
| Comfortable margin | At 1,500 requests per second: 95th percentile 261 ms, 44,575 accepted = 44,575 stored |
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

- Jest and Supertest: 206 tests in 11 suites (unit and integration), about 88 percent statement coverage, run against a separate test database
- Bugs found and fixed by the tests: crashes on `endTime`-only queries, 500 instead of 400 for invalid database input, unsafe paging values, malformed geofence polygons, missed geofence re-entry inside one write group, batch uploads skipping alerts
- Seed script (`npm run seed`, `seed:reset`) and a rewritten backend README
- Docker: backend image plus MongoDB and Redis, with health checks (`docker compose up -d --build`)
- GitHub Actions CI: runs all tests with real MongoDB and Redis and smoke-tests the Docker stack on every push
- Refine and polish the UI: Frontend team

## Final Review Checklist

| Requirement | Result |
|---|---|
| Robust data pipeline that parses and routes many concurrent spatial streams | **Done** (see the mid-project results and the architecture document) |
| Unit test coverage with Jest and Supertest | **Done.** 206 tests, about 88 percent coverage |
| CI/CD pipeline | **Done.** `.github/workflows/ci.yml` |
| Deployment | **Done.** Docker Compose stack, tested on a PC and in CI |
| Steady 60 FPS viewport with thousands of live objects | Frontend team |
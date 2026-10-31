# FleetDash

![CI](https://github.com/PallaviPandurangPawar/FleetDash/actions/workflows/ci.yml/badge.svg)

**High-throughput, event-driven fleet telemetry dashboard.** Thousands of vehicles send GPS readings; the backend
stores them efficiently, shows them live on a map and raises an alert the moment a vehicle leaves a geofenced zone,
without dropping a single data point. Built as an internship project for Infotact Solutions.

![System flow](docs/system-flow.jpeg)

## Highlights

- **Fast ingestion:** about 1,950 requests per second sustained with no lost data (95th percentile 428 ms)
- **Efficient storage:** MongoDB Bucket Pattern (100 readings per document), queries in about 1 ms
- **Live updates:** Redis Pub/Sub and Socket.io deliver the newest position of every vehicle as one binary message every 100 ms
- **Geofence alerts:** Turf.js detects enter and exit events and pushes them live
- **Non-blocking analytics:** trip summary and safety score computed in worker threads
- **Tested:** 206 automated tests (about 88 percent coverage), run on every push by GitHub Actions
- **One-command deployment:** Docker Compose with MongoDB, Redis and the backend

## Tech stack

| Area | Technology |
|---|---|
| Backend | Node.js, Express, `worker_threads` |
| Database | MongoDB (Bucket Pattern), Mongoose |
| Real-time | Redis Pub/Sub, Socket.io, binary payloads |
| Geospatial | Turf.js |
| Frontend | React, TypeScript, Canvas API |
| Testing | Jest, Supertest, k6 |
| Deployment | Docker, GitHub Actions |

## Quick start

### With Docker (needs Docker Desktop running)

```bash
docker compose up -d --build
docker compose ps                                          # all three services should be healthy
curl http://localhost:5000/api/health
docker compose exec backend node scripts/seed.js --force  # optional: sample vehicles and geofences
docker compose down                                        # stop (add -v to delete the data)
```

The backend listens on port 5000; MongoDB and Redis are exposed on 27018 and 6380 so they do not clash with local installs.

### Without Docker

You need Node.js 22 or newer, MongoDB and Redis running locally.

```bash
cd Backend
npm install
copy .env.example .env       # Mac and Linux: cp .env.example .env
npm run dev
node scripts/simulator.js    # optional: 20 fake trucks driving around Kolkata
```

### Frontend

See [`Frontend/README.md`](Frontend/README.md).

## Tests

```bash
cd Backend
npm test                  # all tests (needs MongoDB and Redis running)
npm run test:coverage     # with a coverage table
```

## Documentation

| Document | Content |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Design, data flow, storage, real-time layer, geofencing, design decisions |
| [`docs/api.md`](docs/api.md) | REST API, Socket.io events and the binary message layout |
| [`docs/weekly-progress.md`](docs/weekly-progress.md) | Weekly log and review checklists |
| [`Backend/README.md`](Backend/README.md) | Backend setup, configuration and scripts |
| [`Backend/loadtests/README.md`](Backend/loadtests/README.md) | Load test results and how to repeat them |

## Repository layout

```
FleetDash/
  Backend/              Node.js API, workers, real-time server, tests, load tests
  Frontend/             React + TypeScript dashboard
  docs/                 architecture, API reference, progress log, diagrams
  docker-compose.yml    MongoDB + Redis + backend
  .github/workflows/    CI pipeline
```
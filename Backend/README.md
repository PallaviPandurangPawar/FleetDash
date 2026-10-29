# FleetDash - Backend

Node.js / Express backend for live fleet tracking. It takes in GPS telemetry from thousands of vehicles,
stores it efficiently in MongoDB, pushes live positions and geofence alerts to dashboards, and runs
heavy analytics in worker threads.

```
 vehicles ──HTTP──► Express ──► validation ──► group-commit ──► MongoDB (bucket pattern)
                                                     │
                                                     ├──► Turf.js geofence check ──► alerts (MongoDB + Redis)
                                                     └──► Redis pub/sub ──► Socket.io ──► dashboards (binary batches)
 analytics API ──► worker_threads pool (distance, safety score, geofence checks)
```

## Quick start

You need Node.js, MongoDB and Redis (or Memurai on Windows) running locally.

```bash
cd Backend
npm install
copy .env.example .env      # on Mac/Linux: cp .env.example .env
npm run dev                 # restarts on file changes
npm run seed                # optional: 10 sample vehicles and 3 sample geofences
node scripts/simulator.js   # optional: 20 fake trucks driving around Kolkata
```

The server listens on `http://localhost:5000`. Check `GET /api/health`.

## npm scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start the server and restart it when files change |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run all tests and print a coverage table |
| `npm run seed` | Add sample vehicles (`FLEET-001`...) and geofences. Safe to run again. Use `node scripts/seed.js --count=50` for more vehicles |
| `npm run seed:reset` | Remove only the data the seed script created |

Other scripts in `scripts/`: `simulator.js` (fake vehicles), `socketListener.js` (print live messages),
`benchmarkQueries.js` (query speed), `countLoadReadings.js` (verify load tests), `syncIndexes.js` (rebuild indexes).

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 5000 | HTTP port |
| `NODE_ENV` | development | `development` also puts stack traces into error responses |
| `MONGODB_URI` | mongodb://localhost:27017/fleetdash | MongoDB connection string |
| `REDIS_URL` | redis://127.0.0.1:6379 | Redis connection |
| `WORKER_POOL_SIZE` | CPU cores (2 to 8) | Worker threads for analytics |
| `PARSE_POOL_SIZE` | 2 | Worker threads that validate large batches |
| `BUCKET_MAX_SIZE` | 100 | Readings per bucket document |
| `MAX_BATCH_SIZE` | 5000 | Largest `/ingest-batch` request |
| `FLUSH_INTERVAL_MS` | 10 | How long readings are grouped before one database write |
| `BROADCAST_INTERVAL_MS` | 100 | How often live updates are sent to dashboards |
| `GEOFENCE_REFRESH_MS` | 5000 | How often active geofences are reloaded |
| `CORS_ORIGIN` | * | Browser origin allowed to connect to Socket.io |
| `LOG_LEVEL` | info | `debug`, `info`, `warn`, `error` or `silent` |
| `LOG_REQUESTS` | true | Set to `false` to silence per-request logs (load tests) |

## How it works

### MongoDB bucket pattern
One document per GPS reading would create millions of tiny documents. Instead, readings are grouped into
**buckets of up to 100 readings** (`TelemetryBucket`). Each bucket keeps a ready-made summary (min/max/sum speed,
fuel, engine temperature), updated with atomic `$push`, `$inc`, `$min` and `$max` operations.

One compound index serves both "find the open bucket" and "latest buckets of a vehicle":

```
{ vehicleId: 1, bucketStartTime: -1, count: 1 }
```

Measured query time is about 1 ms (see `loadtests/README.md`).

### Ingestion
1. `validateTelemetry` middleware rejects bad input with a 400: vehicle IDs must be 1 to 16 characters
   (letters, numbers, `-`, `_`), coordinates must be valid, a batch holds at most `MAX_BATCH_SIZE` readings.
2. **Group commit:** readings for the same vehicle that arrive within a few milliseconds are written to MongoDB
   together, and every request is answered only after its reading is stored (no data is lost).
3. Batches of 200 or more readings are validated and sorted in a `worker_threads` pool, off the main thread.
4. After storing, the newest position is published to Redis, and **every** reading is checked against the
   geofences in time order. This happens for both `/ingest` and `/ingest-batch`.

### Real-time layer
Redis pub/sub decouples ingestion from the dashboards. The Socket.io server subscribes to Redis, collects the
newest position of each vehicle for 100 ms and sends them to all clients as **one binary message**.

| Socket event | Payload |
|---|---|
| `vehicles:binary` | Binary batch (format below) |
| `geofence:alert` | JSON, sent immediately |

Alert JSON: `{ id, type: "exit" | "enter", vehicleId, geofenceId, geofenceName, lon, lat, occurredAt }`

Binary format (little-endian):

| Part | Size | Content |
|---|---|---|
| Header | 8 bytes | version (uint16, = 1), reserved (uint16), vehicle count (uint32) |
| Record (repeated) | 56 bytes | vehicleId (16 ASCII bytes, zero padded), lon (float64), lat (float64), timestamp in ms (float64), speed (float32), heading (float32), fuelLevel (float32), ignition (uint32, 0 or 1) |

### Geofencing
Active geofences are kept in memory (reloaded every 5 s). A cheap bounding-box test runs first, then an exact
Turf.js point-in-polygon test. The service remembers whether each vehicle was inside or outside each geofence and
creates an `exit` or `enter` alert only when that changes. The first position of a vehicle never creates an alert.
A reading that is older than one already checked for the same vehicle is skipped, so late data cannot turn the
remembered state back. A geofence with an empty `vehicleIds` list applies to every vehicle.

### Worker threads
The analytics API (`/api/analytics`) runs on a pool of worker threads (FIFO queue, automatic respawn when a worker
crashes), so heavy maths never blocks Express.

## API

All routes start with `/api`. Errors look like `{ "success": false, "error": { "status": 400, "message": "..." } }`
(the validation middleware and a few controllers return `{ "error": "..." }`).

### Health
- `GET /health` - database state and worker pool status

### Vehicles
- `POST /vehicles` - register: `vehicleId`, `plateNumber` (required), `make`, `model`, `year`, `driverName`. 409 if it exists
- `GET /vehicles?status=&page=&limit=` - list (limit 1 to 500, bad values fall back to defaults)
- `GET /vehicles/:vehicleId` - one vehicle with its last position and telemetry
- `PUT /vehicles/:vehicleId` - update details. `vehicleId`, `lastTelemetry` and `lastKnownLocation` cannot be changed here

### Telemetry
- `POST /telemetry/ingest` - one reading:
  ```json
  { "vehicleId": "TRUCK-01", "coordinates": [88.36, 22.57], "speed": 65.4, "fuelLevel": 82,
    "engineTemp": 88.5, "heading": 120, "ignition": true, "timestamp": "2026-01-01T12:00:00Z" }
  ```
  `coordinates` is `[longitude, latitude]`. Everything except `vehicleId` and `coordinates` is optional.
- `POST /telemetry/ingest-batch` - `{ "vehicleId": "TRUCK-01", "readings": [ ... ] }`. Invalid readings are skipped and counted in `rejectedCount`
- `GET /telemetry/:vehicleId?startTime=&endTime=&limit=` - history, oldest first
- `GET /telemetry/:vehicleId/bucket-stats` - totals over all buckets

### Geofences
- `POST /geofences` - `name`, `coordinates` (a GeoJSON polygon: `[[[lon, lat], ...]]`, first and last point equal), optional `description`, `vehicleIds`, `active`
- `GET /geofences?active=true|false`, `GET /geofences/:id`, `PUT /geofences/:id`, `DELETE /geofences/:id`

### Alerts
- `GET /alerts?vehicleId=&type=exit|enter&acknowledged=true|false&page=&limit=`
- `GET /alerts/summary` - totals
- `PATCH /alerts/:id/acknowledge`
- `POST /alerts/acknowledge-all` - optional `{ "vehicleId": "..." }`

### Analytics (worker threads)
- `GET /analytics/trip-summary/:vehicleId?startTime=&endTime=&limit=&speedLimit=80&harshBrakeThreshold=25` - distance, duration, average and top speed, speeding count, harsh braking count, idle time and a safety score (100 minus 2 per speeding reading and 5 per harsh braking, never below 10)
- `POST /analytics/geofence-check` - `{ "vehicleId": "...", "geofences": [{ "name": "A", "polygon": [[lon, lat], ...] }] }` returns the stored readings that are inside each polygon
- `GET /analytics/worker-stats` - worker pool load and memory

## Testing

```bash
npm test                 # all tests
npm run test:coverage    # with a coverage table
```

Jest and Supertest. The tests use the separate database `fleetdash_test` (set in `tests/setup.js`) and delete their
own `TEST-` data, so your normal data is never touched. They need **MongoDB and Redis running**. The test suites
share one database, so Jest runs them one after another.

- `tests/unit` - validators, binary codec, geofence logic, analytics maths and worker threads, bucket service, seed script
- `tests/integration` - telemetry, vehicles, geofences and alerts, analytics and Socket.io (Redis to client) APIs

## Load testing

k6 scripts are in `loadtests/` and the measured results are in `loadtests/README.md`:
about 1,950 requests per second sustained with no lost data, p95 under 500 ms, and bucket queries around 1 ms.

## Project structure

```
Backend/
  server.js                 app setup and startup
  src/
    config/                 settings (db, redis, socket, general)
    models/                 Vehicle, TelemetryBucket, Geofence, Alert
    routes/ controllers/    HTTP API
    middlewares/            validation and error handling
    services/               bucket, ingestion, geofence, alert and redis logic
    sockets/                Socket.io server and event names
    workers/                worker pools and the analytics / parse workers
    utils/                  validators, binary codec, logger
  scripts/                  seed, simulator and helper scripts
  loadtests/                k6 load tests and results
  tests/                    unit and integration tests
```
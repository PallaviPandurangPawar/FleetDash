# FleetDash - Backend Engine

A high-throughput, low-latency Node.js/Express fleet management backend built specifically for IoT GPS telemetry, vehicle tracking, and automated trip analytics.

---

## 🚀 Key Architectural Highlights

### 1. 📦 MongoDB Bucket Pattern (`TelemetryBucket.js`)
In IoT and fleet tracking systems, storing 1 document per GPS reading quickly results in millions of tiny documents, bloated B-tree index sizes, and poor query performance. Storing all readings in a single vehicle document eventually hits MongoDB's 16MB document limit.

**Our Implementation:**
- Telemetry readings are stored into capped bucket documents (configurable via `BUCKET_MAX_SIZE`, default: 100 readings per bucket).
- Ingestion occurs atomically via MongoDB `$push`, `$inc`, `$min`, and `$max`.
- Pre-aggregated metrics (`avgSpeed`, `maxSpeed`, `minFuelLevel`, etc.) are maintained directly inside the bucket document header.
- High-efficiency compound indexes: `{ vehicleId: 1, count: 1 }` and `{ vehicleId: 1, bucketStartTime: -1 }`.

### 2. ⚡ Multithreaded Processing via `node:worker_threads`
Heavy mathematical computations (such as calculating Haversine distances across thousands of coordinates, speed variance, harsh braking detection, and 2D polygon ray-casting for geofencing) block the single-threaded Node.js event loop if run on the main thread.

**Our Implementation (`workerPool.js` & `analyticsWorker.js`):**
- A thread pool is spawned at server startup matching system CPU cores.
- Tasks are scheduled via a FIFO queue and resolved asynchronously via native Promises.
- Automatic worker respawning on unexpected crashes.
- Keeps Express free to handle high-concurrency incoming HTTP pings.

---

## 🛠️ API Endpoints

### 🩺 Health & Diagnostics
- `GET /api/health` - Database connection state & worker thread pool status
- `GET /api/analytics/worker-stats` - Real-time worker thread pool load and memory metrics

### 🚗 Vehicle Management
- `POST /api/vehicles` - Register vehicle (`vehicleId`, `plateNumber`, `make`, `model`, etc.)
- `GET /api/vehicles` - List vehicles with pagination and status filter
- `GET /api/vehicles/:vehicleId` - Retrieve vehicle with last known coordinates & telemetry
- `PUT /api/vehicles/:vehicleId` - Update vehicle details

### 📡 Telemetry Ingestion (MongoDB Bucket Pattern)
- `POST /api/telemetry/ingest` - Ingest single GPS/sensor ping:
  ```json
  {
    "vehicleId": "TRUCK-01",
    "coordinates": [90.4125, 23.8103],
    "speed": 65.4,
    "fuelLevel": 82.0,
    "engineTemp": 88.5,
    "odometerKm": 12450.2,
    "heading": 120,
    "ignition": true
  }
  ```
- `POST /api/telemetry/ingest-batch` - Ingest an array of readings for high throughput
- `GET /api/telemetry/:vehicleId` - Retrieve historical readings with optional `startTime` and `endTime`
- `GET /api/telemetry/:vehicleId/bucket-stats` - View aggregate bucket statistics

### 📊 Heavy Analytics (Worker Threads)
- `GET /api/analytics/trip-summary/:vehicleId` - Offloads Haversine route distance, speed profiling, harsh braking, and driver safety score computation to worker thread pool.
- `POST /api/analytics/geofence-check` - Ray-casting polygon intersection checking in worker threads.

---

## 🏃 Running Locally

```bash
cd Backend
npm install
npm run dev
```

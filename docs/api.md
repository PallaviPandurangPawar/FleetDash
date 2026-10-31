# FleetDash API Reference

Base URL: `http://localhost:5000/api`. All bodies are JSON. Coordinates are always `[longitude, latitude]`.

## Errors

Most errors look like this (validation, 404 for unknown routes, database errors):

```json
{ "success": false, "error": { "status": 400, "message": "..." } }
```

Some controllers return a short form: `{ "error": "message" }`. The status codes are:
`400` bad input, `404` not found, `409` already exists. Database validation errors are returned as 400, never 500.

## Health

`GET /health`

```json
{ "status": "ok", "timestamp": "...", "service": "FleetDash Backend Engine", "database": "connected",
  "workerPool": { "poolSize": 4, "activeWorkers": 0, "idleWorkers": 4, "pendingTasks": 0, "completedTasks": 0 },
  "uptimeSeconds": 372, "nodeVersion": "v22.23.4", "memoryUsageMB": 141 }
```

## Vehicles

| Method and path | What it does |
|---|---|
| `POST /vehicles` | Register a vehicle. Required: `vehicleId`, `plateNumber`. Optional: `make`, `model`, `year`, `driverName`. `201` with `{ success, vehicle }`, `409` if it exists |
| `GET /vehicles?status=&page=&limit=` | List vehicles. `limit` 1 to 500 (default 50); bad values fall back to the defaults. Returns `{ success, total, page, totalPages, vehicles }` |
| `GET /vehicles/:vehicleId` | One vehicle with its last position and telemetry |
| `PUT /vehicles/:vehicleId` | Update details. `vehicleId`, `lastTelemetry` and `lastKnownLocation` cannot be changed here |

Vehicle status values: `idle`, `in_transit`, `maintenance`, `offline` (set automatically from telemetry: moving = `in_transit`,
stopped with the engine on = `idle`, stopped with the engine off = `offline`).

## Telemetry

### `POST /telemetry/ingest` - one reading

```json
{ "vehicleId": "TRUCK-01", "coordinates": [88.36, 22.57], "speed": 65.4, "fuelLevel": 82,
  "engineTemp": 88.5, "heading": 120, "ignition": true, "timestamp": "2026-01-01T12:00:00Z" }
```

Only `vehicleId` and `coordinates` are required. Response `201`:

```json
{ "success": true, "bucketId": "6ae18b58818bebc7c93a8438", "vehicleId": "TRUCK-01", "bucketCount": 1, "isBucketFull": false }
```

Validation: `vehicleId` is 1 to 16 characters (letters, numbers, `-`, `_`); longitude -180 to 180; latitude -90 to 90;
`speed` 0 or more; `timestamp` must be a valid date.

### `POST /telemetry/ingest-batch` - many readings for one vehicle

```json
{ "vehicleId": "TRUCK-01", "readings": [ { "coordinates": [88.36, 22.57], "speed": 40, "timestamp": "..." } ] }
```

At most 5,000 readings. Invalid readings are skipped and counted. Response `201`:

```json
{ "success": true, "vehicleId": "TRUCK-01", "ingestedCount": 300, "rejectedCount": 0,
  "buckets": [ { "bucketId": "...", "added": 100, "bucketCount": 100 } ] }
```

The newest reading is also sent to live clients, and every reading is checked against the geofences.

### `GET /telemetry/:vehicleId?startTime=&endTime=&limit=`

History, **oldest first**. `startTime` and `endTime` (ISO dates) are both optional. `limit` returns the newest readings (default 500).

```json
{ "success": true, "vehicleId": "TRUCK-01", "count": 2,
  "readings": [ { "timestamp": "...", "location": { "type": "Point", "coordinates": [88.36, 22.57] },
                  "speed": 40, "heading": 90, "fuelLevel": 82, "engineTemp": 88, "ignition": true } ] }
```

### `GET /telemetry/:vehicleId/bucket-stats`

```json
{ "success": true, "vehicleId": "TRUCK-01",
  "bucketPatternStats": { "totalBuckets": 2, "totalReadings": 150, "avgFleetSpeed": 26.5, "maxOverallSpeed": 59,
                          "maxOverallEngineTemp": 85, "firstReading": "...", "lastReading": "..." } }
```

For an unknown vehicle: `{ "totalBuckets": 0, "totalReadings": 0 }`.

## Geofences

| Method and path | What it does |
|---|---|
| `POST /geofences` | Create. Body: `name`, `coordinates` (GeoJSON polygon `[[[lon, lat], ...]]`, first and last point equal), optional `description`, `vehicleIds` (empty = all vehicles), `active`. `201` with `{ success, geofence }` |
| `GET /geofences?active=true\|false` | List. Returns `{ success, count, geofences }` |
| `GET /geofences/:id` | One geofence (`400` for a bad id, `404` if unknown) |
| `PUT /geofences/:id` | Update `name`, `description`, `vehicleIds`, `active` or `coordinates` |
| `DELETE /geofences/:id` | Delete. Returns `{ success, deleted: "<id>" }` |

A polygon with an unclosed ring, fewer than 4 points or coordinates out of range is rejected with `400`.

## Alerts

An alert is created when a vehicle crosses a geofence boundary.

```json
{ "_id": "...", "type": "exit", "vehicleId": "TRUCK-01", "geofenceId": "...", "geofenceName": "Kolkata Central Zone",
  "location": { "type": "Point", "coordinates": [88.5, 22.55] }, "occurredAt": "...", "acknowledged": false }
```

| Method and path | What it does |
|---|---|
| `GET /alerts?vehicleId=&type=exit\|enter&acknowledged=true\|false&page=&limit=` | List, newest first. Returns `{ total, page, totalPages, alerts }` |
| `GET /alerts/summary` | `{ total, unacknowledged, exits, enters }` |
| `PATCH /alerts/:id/acknowledge` | Mark one alert as handled. Returns `{ alert }` |
| `POST /alerts/acknowledge-all` | Body `{ "vehicleId": "..." }` is optional. Returns `{ acknowledged: <number> }` |

## Analytics (worker threads)

### `GET /analytics/trip-summary/:vehicleId`

Query: `startTime`, `endTime`, `limit` (newest readings, default 2000, maximum 10000), `speedLimit` (default 80), `harshBrakeThreshold` (default 25).

```json
{ "success": true, "vehicleId": "TRUCK-01", "processedBy": "worker_threads", "executionTimeMs": 12,
  "analytics": { "totalPoints": 4, "totalDistanceKm": 3.34, "durationMinutes": 3, "avgSpeed": 76.3, "maxSpeed": 90,
                 "speedingCount": 2, "harshBrakingCount": 0, "idleDurationMinutes": 0, "safetyScore": 96 } }
```

With no data: `{ "success": true, "vehicleId": "...", "message": "No telemetry data found...", "analytics": null }`.

### `POST /analytics/geofence-check`

Finds which stored readings of a vehicle are inside the given polygons (no stored geofence is needed).

```json
{ "vehicleId": "TRUCK-01", "geofences": [ { "name": "Depot", "polygon": [[88.3, 22.5], [88.4, 22.5], [88.4, 22.6], [88.3, 22.5]] } ], "limit": 1000 }
```

`polygon` is a list of at least 3 `[lon, lat]` positions. Response:

```json
{ "success": true, "vehicleId": "TRUCK-01", "processedBy": "worker_threads", "executionTimeMs": 8,
  "totalBreachesFound": 2,
  "breaches": [ { "geofenceName": "Depot", "timestamp": "...", "coordinates": [88.35, 22.55], "speed": 30 } ] }
```

### `GET /analytics/worker-stats`

`{ success, workerPool: { poolSize, activeWorkers, idleWorkers, pendingTasks, completedTasks }, memoryUsage, uptimeSeconds }`

## Socket.io events

Connect to `http://localhost:5000` (set `CORS_ORIGIN` to limit which sites may connect).

| Event | Direction | Payload |
|---|---|---|
| `vehicles:binary` | server to client, about every 100 ms | One binary message with the newest position of every vehicle that sent data |
| `geofence:alert` | server to client, immediately | JSON: `{ id, type: "exit" or "enter", vehicleId, geofenceId, geofenceName, lon, lat, occurredAt }` |

### Binary message layout (little-endian)

| Offset | Size | Field |
|---|---|---|
| 0 | 2 bytes | version (= 1) |
| 2 | 2 bytes | reserved |
| 4 | 4 bytes | number of vehicles (`count`) |
| 8 + 56 x i | 16 bytes | vehicleId, ASCII, zero padded |
| + 16 | 8 bytes | longitude (float64) |
| + 24 | 8 bytes | latitude (float64) |
| + 32 | 8 bytes | timestamp in ms (float64) |
| + 40 | 4 bytes | speed (float32) |
| + 44 | 4 bytes | heading (float32) |
| + 48 | 4 bytes | fuelLevel (float32) |
| + 52 | 4 bytes | ignition (uint32, 0 or 1) |

### Example client

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', { transports: ['websocket'] });

socket.on('vehicles:binary', (data) => {
  const view = new DataView(data instanceof ArrayBuffer ? data : data.buffer);
  const count = view.getUint32(4, true);
  for (let i = 0; i < count; i++) {
    const at = 8 + i * 56;
    let vehicleId = '';
    for (let c = 0; c < 16; c++) {
      const code = view.getUint8(at + c);
      if (code === 0) break;
      vehicleId += String.fromCharCode(code);
    }
    const lon = view.getFloat64(at + 16, true);
    const lat = view.getFloat64(at + 24, true);
    const speed = view.getFloat32(at + 40, true);
    console.log(vehicleId, lon, lat, speed);
  }
});

socket.on('geofence:alert', (alert) => console.log('ALERT', alert.type, alert.vehicleId, alert.geofenceName));
```
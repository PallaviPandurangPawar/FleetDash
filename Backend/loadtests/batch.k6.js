// Backend/loadtests/batch.k6.js
// k6 load test for POST /api/telemetry/ingest-batch
//
// Settings (environment variables):
//   RATE=5          batch requests per second
//   BATCH_SIZE=100  readings inside each request (200 or more is parsed in a worker thread)
//   VEHICLES=50     number of different vehicles
//   DURATION=20s    test length
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const RATE = parseInt(__ENV.RATE || '5');
const BATCH_SIZE = parseInt(__ENV.BATCH_SIZE || '100');
const VEHICLES = parseInt(__ENV.VEHICLES || '50');
const DURATION = __ENV.DURATION || '20s';

const readingsSent = new Counter('readings_sent');
const readingsIngested = new Counter('readings_ingested');

export const options = {
  scenarios: {
    batch: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(10, RATE),
      maxVUs: Math.max(50, RATE * 4),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const vehicleId = `BATCH-${String(Math.floor(Math.random() * VEHICLES) + 1).padStart(3, '0')}`;
  const now = Date.now();

  const readings = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    readings.push({
      coordinates: [88.3 + Math.random() * 0.2, 22.5 + Math.random() * 0.2],
      speed: Math.floor(Math.random() * 80),
      fuelLevel: 50 + Math.random() * 50,
      engineTemp: 80 + Math.random() * 20,
      heading: Math.floor(Math.random() * 360),
      timestamp: new Date(now - (BATCH_SIZE - i) * 1000).toISOString(),
    });
  }

  const res = http.post(
    `${BASE_URL}/api/telemetry/ingest-batch`,
    JSON.stringify({ vehicleId, readings }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  readingsSent.add(BATCH_SIZE);

  const ok = check(res, { 'status is 201': (r) => r.status === 201 });
  if (ok) readingsIngested.add(res.json('ingestedCount'));
}
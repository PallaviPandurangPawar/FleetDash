import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const RATE = parseInt(__ENV.RATE || '30');
const DURATION = __ENV.DURATION || '20s';
const VEHICLES = parseInt(__ENV.VEHICLES || '50');

const accepted = new Counter('readings_accepted');

export const options = {
  scenarios: {
    ingest: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(20, Math.ceil(RATE / 10)),
      maxVUs: Math.max(100, RATE),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const vehicleId = `LOAD-${String(Math.floor(Math.random() * VEHICLES) + 1).padStart(3, '0')}`;
  const payload = JSON.stringify({
    vehicleId,
    coordinates: [88.3 + Math.random() * 0.2, 22.5 + Math.random() * 0.2],
    speed: Math.floor(Math.random() * 80),
    fuelLevel: 50 + Math.random() * 50,
    engineTemp: 80 + Math.random() * 20,
    heading: Math.floor(Math.random() * 360),
  });

  const res = http.post(`${BASE_URL}/api/telemetry/ingest`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const ok = check(res, { 'status is 201': (r) => r.status === 201 });
  if (ok) accepted.add(1);
}
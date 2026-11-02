// Backend/loadtests/ingest.k6.js
// k6 load test for POST /api/telemetry/ingest
//
// Settings (environment variables):
//   RATE=2000      requests per second to send
//   DURATION=30s   test length
//   VEHICLES=50    number of different vehicles
//   MOVEMENT       smooth (default) or random
//                    smooth: every vehicle drives slowly around its own circle, like a real fleet.
//                            It crosses a geofence boundary only now and then.
//                    random: every reading is a random position. Vehicles "jump" in and out of
//                            geofences on about every second reading, which creates thousands of alerts
//                            per second. Use it as a stress test of the alert pipeline, not of ingestion.
//   PRE_VUS        virtual users created BEFORE the test starts (default: 100% of RATE)
//   MAX_VUS        most virtual users k6 may use (default: 2 x RATE)
//   RAMP=10s       warm-up: the rate grows from 100/s to RATE during this time, so the connections
//                  are opened gradually instead of all at the same moment. Only the steady part
//                  after the ramp is used for the achieved rate and the p95.
//
// Why PRE_VUS matters: while a request waits for its answer, its virtual user is busy.
// To send RATE requests per second with an average answer time of 0.3 s, about 0.3 x RATE
// virtual users are busy at the same moment. If they are not created in advance, k6 creates
// them during the test, cannot keep the rate and reports "dropped_iterations".
import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const RATE = parseInt(__ENV.RATE || '30');
const DURATION = __ENV.DURATION || '20s';
const VEHICLES = parseInt(__ENV.VEHICLES || '50');
const MOVEMENT = (__ENV.MOVEMENT || 'smooth').toLowerCase();
const PRE_VUS = parseInt(__ENV.PRE_VUS || String(Math.max(20, RATE)));
const MAX_VUS = parseInt(__ENV.MAX_VUS || String(Math.max(100, RATE * 2)));
const RAMP = __ENV.RAMP || '10s';

// "30s" -> 30, "2m" -> 120
function toSeconds(text) {
  const match = /^(\d+)(s|m)$/.exec(text);
  if (!match) throw new Error(`Use a duration like 30s or 2m, not "${text}"`);
  return Number(match[1]) * (match[2] === 'm' ? 60 : 1);
}
const RAMP_MS = toSeconds(RAMP) * 1000;

const accepted = new Counter('readings_accepted');
const failedNetwork = new Counter('failed_network'); // no answer at all: connection refused, reset or timeout
const failedServer = new Counter('failed_server'); // the server answered with an error (500 and up)
const failedOther = new Counter('failed_other'); // any other unexpected status (for example 400)

export const options = {
  discardResponseBodies: true, // only the status code is checked, so k6 does not keep the answers
  scenarios: {
    ingest: {
      // Ramp from a low rate up to RATE, then hold RATE for DURATION
      executor: 'ramping-arrival-rate',
      startRate: Math.min(RATE, 100),
      timeUnit: '1s',
      preAllocatedVUs: PRE_VUS,
      maxVUs: MAX_VUS,
      stages: [
        { target: RATE, duration: RAMP },
        { target: RATE, duration: DURATION },
      ],
    },
  },
  thresholds: {
    // failures and dropped requests are counted over the WHOLE run (also the ramp)
    http_req_failed: ['rate<0.01'],
    dropped_iterations: ['count==0'],
    // speed and rate are measured on the steady part only (requests tagged phase:steady)
    'http_req_duration{phase:steady}': ['p(95)<500'],
    'http_reqs{phase:steady}': [`count>=${Math.floor(RATE * toSeconds(DURATION) * 0.99)}`],
  },
};

// Where vehicle number n is right now
function position(n) {
  if (MOVEMENT === 'random') {
    return [88.3 + Math.random() * 0.2, 22.5 + Math.random() * 0.2];
  }
  // One lap takes 10 minutes. The circles (radius 0.020 to 0.036 degrees) stay inside the central zone
  // 88.30 to 88.40 / 22.50 to 22.65, so only the smaller zones are crossed now and then.
  const angle = (Date.now() / 600000) * 2 * Math.PI + n * 0.7;
  const radius = 0.02 + (n % 5) * 0.004;
  return [88.35 + radius * Math.cos(angle), 22.575 + radius * Math.sin(angle)];
}

export function setup() {
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    fail(`The server at ${BASE_URL} did not answer /api/health (status ${res.status}). Start it first.`);
  }
}

export default function () {
  const n = Math.floor(Math.random() * VEHICLES) + 1;
  const payload = JSON.stringify({
    vehicleId: `LOAD-${String(n).padStart(3, '0')}`,
    coordinates: position(n),
    speed: Math.floor(Math.random() * 80),
    fuelLevel: 50 + Math.random() * 50,
    engineTemp: 80 + Math.random() * 20,
    heading: Math.floor(Math.random() * 360),
  });

  // "steady" = after the warm-up ramp; only these requests are used for the achieved rate and p95
  const steady = Date.now() - exec.scenario.startTime >= RAMP_MS;

  const res = http.post(`${BASE_URL}/api/telemetry/ingest`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s', // a stuck request counts as a failure after 10 s instead of 60 s, so it cannot block a virtual user
    tags: { phase: steady ? 'steady' : 'ramp' },
  });

  const ok = check(res, { 'status is 201': (r) => r.status === 201 });
  if (ok) accepted.add(1);
  else if (res.status === 0) failedNetwork.add(1);
  else if (res.status >= 500) failedServer.add(1);
  else failedOther.add(1);
}
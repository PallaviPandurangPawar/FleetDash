/**
 * Vehicle simulator: fake trucks drive around Kolkata and report GPS readings.
 *
 * Usage (from the Backend folder, with the server running):
 *   node scripts/simulator.js
 * Optional settings (environment variables):
 *   VEHICLES=50  INTERVAL_MS=1000  TIME_SCALE=10  BASE_URL=http://localhost:5000
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const COUNT = parseInt(process.env.VEHICLES, 10) || 20;
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS, 10) || 1000;
// TIME_SCALE makes trucks move faster on the map (10 = each tick simulates 10 seconds of driving)
const TIME_SCALE = parseInt(process.env.TIME_SCALE, 10) || 10;

const CENTER = { lon: 88.3639, lat: 22.5726 }; // Kolkata
const HEADERS = { 'Content-Type': 'application/json' };

const vehicles = Array.from({ length: COUNT }, (_, i) => ({
  vehicleId: `SIM-${String(i + 1).padStart(3, '0')}`,
  plateNumber: `WB-SIM-${String(i + 1).padStart(3, '0')}`,
  lon: CENTER.lon + (Math.random() - 0.5) * 0.1,
  lat: CENTER.lat + (Math.random() - 0.5) * 0.1,
  heading: Math.random() * 360,
  speed: 20 + Math.random() * 40,
  fuel: 60 + Math.random() * 40,
}));

let sent = 0;
let failed = 0;

async function registerVehicles() {
  for (const v of vehicles) {
    try {
      // 201 = created, 409 = already exists: both are fine
      await fetch(`${BASE_URL}/api/vehicles`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ vehicleId: v.vehicleId, plateNumber: v.plateNumber, driverName: `Driver ${v.vehicleId}` }),
      });
    } catch (err) {
      console.error(`Could not register ${v.vehicleId}: ${err.message}`);
    }
  }
}

function move(v) {
  v.heading = (v.heading + (Math.random() - 0.5) * 30 + 360) % 360;
  v.speed = Math.max(0, Math.min(80, v.speed + (Math.random() - 0.5) * 10));
  v.fuel = Math.max(5, v.fuel - 0.01);

  const hours = (INTERVAL_MS / 3600000) * TIME_SCALE;
  const distKm = v.speed * hours;
  const rad = (v.heading * Math.PI) / 180;
  v.lat += (distKm * Math.cos(rad)) / 110.574;
  v.lon += (distKm * Math.sin(rad)) / (111.32 * Math.cos((v.lat * Math.PI) / 180));
}

async function tick() {
  await Promise.all(
    vehicles.map(async (v) => {
      move(v);
      try {
        const res = await fetch(`${BASE_URL}/api/telemetry/ingest`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            vehicleId: v.vehicleId,
            coordinates: [v.lon, v.lat],
            speed: Math.round(v.speed),
            heading: Math.round(v.heading),
            fuelLevel: Number(v.fuel.toFixed(1)),
            engineTemp: 80 + Math.round(Math.random() * 15),
            ignition: true,
          }),
        });
        if (res.ok) sent += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    })
  );
}

async function main() {
  console.log(`Simulating ${COUNT} vehicles every ${INTERVAL_MS} ms against ${BASE_URL}`);
  await registerVehicles();
  console.log('Vehicles registered. Driving... (press Ctrl + C to stop)');

  setInterval(tick, INTERVAL_MS);
  setInterval(() => {
    console.log(`[simulator] readings sent: ${sent} | failed: ${failed}`);
  }, 5000);
}

process.on('SIGINT', () => {
  console.log(`\nStopped. Total sent: ${sent}, failed: ${failed}`);
  process.exit(0);
});

main();
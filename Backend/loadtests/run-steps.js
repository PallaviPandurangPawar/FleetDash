// Backend/loadtests/run-steps.js
// Finds how much ingestion the server can take: runs the ingest load test at several rates, one after
// another, and prints ONE table.
//
// Needs: the server running (set LOG_REQUESTS=false first, then npm start), k6 installed, MongoDB reachable.
//
//   node loadtests/run-steps.js                 rates 500, 1000, 1500, 2000
//   node loadtests/run-steps.js 1800 2000       your own rates
//   set STEP_DURATION=30s                       length of one step (default 20s)
//   set PAUSE_SECONDS=20                        pause between steps (default 15)
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rates = process.argv.slice(2).map(Number).filter((n) => n > 0);
if (rates.length === 0) rates.push(500, 1000, 1500, 2000);
const duration = process.env.STEP_DURATION || '20s';
const pauseSeconds = Number(process.env.PAUSE_SECONDS || 15);
const durationSeconds = /m$/.test(duration) ? parseInt(duration, 10) * 60 : parseInt(duration, 10);
const backendDir = path.join(__dirname, '..');

// Counts the LOAD-* readings in the database; with clear = true it also deletes them
function storedReadings(clear) {
  const args = ['scripts/countLoadReadings.js'];
  if (clear) args.push('--delete');
  const result = spawnSync(process.execPath, args, { cwd: backendDir, encoding: 'utf8' });
  const match = /readings stored: (\d+)/.exec(result.stdout || '');
  return match ? Number(match[1]) : NaN;
}

function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

const rows = [];

rates.forEach((rate, index) => {
  if (index > 0) {
    console.log(`Pausing ${pauseSeconds} s so the connections of the last step can close...`);
    sleep(pauseSeconds);
  }

  storedReadings(true); // every step starts with an empty test data set
  const summaryFile = path.join(os.tmpdir(), `fleetdash-k6-${rate}.json`);
  if (fs.existsSync(summaryFile)) fs.unlinkSync(summaryFile);

  console.log(`Running ${rate} requests per second for ${duration} ...`);
  // k6 prints its warnings and errors on stderr; keep them in a file so we can show the reasons below
  const logFile = path.join(os.tmpdir(), `fleetdash-k6-${rate}.log`);
  const logFd = fs.openSync(logFile, 'w');
  const run = spawnSync('k6', ['run', '--quiet', '--summary-export', summaryFile, 'loadtests/ingest.k6.js'], {
    cwd: backendDir,
    env: { ...process.env, RATE: String(rate), DURATION: duration },
    stdio: ['ignore', 'ignore', logFd],
  });
  fs.closeSync(logFd);

  if (run.error) {
    console.error(`Could not start k6: ${run.error.message}`);
    process.exit(1);
  }
  if (!fs.existsSync(summaryFile)) {
    console.error('k6 produced no summary. Is the server running on http://localhost:5000 ?');
    process.exit(1);
  }

  const metrics = JSON.parse(fs.readFileSync(summaryFile, 'utf8')).metrics || {};
  const read = (name, key) => {
    const metric = metrics[name];
    if (!metric) return undefined;
    return (metric.values || metric)[key];
  };

  // achieved rate and p95 come from the steady part of the run (after the warm-up ramp)
  const achieved = (read('http_reqs{phase:steady}', 'count') ?? 0) / durationSeconds;
  const p95 = read('http_req_duration{phase:steady}', 'p(95)') ?? NaN;
  const failedPercent = (read('http_req_failed', 'value') ?? read('http_req_failed', 'rate') ?? 0) * 100;
  const dropped = read('dropped_iterations', 'count') ?? 0;
  const accepted = read('readings_accepted', 'count') ?? 0;
  const failedNetwork = read('failed_network', 'count') ?? 0;
  const failedServer = read('failed_server', 'count') ?? 0;
  const failedOther = read('failed_other', 'count') ?? 0;

  // Count the reasons k6 reported (connection refused, timeout, "Insufficient VUs" ...)
  const reasons = new Map();
  for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
    let reason = null;
    const match = /error="((?:[^"\\]|\\.)*)"/.exec(line);
    if (match) {
      reason = match[1]
        .replace(/\\"/g, '"')
        .replace(/^\w+ "[^"]*": /, '')
        .replace(/\d+\.\d+\.\d+\.\d+:\d+/g, 'addr')
        .slice(0, 100);
    } else if (line.includes('Insufficient VUs')) {
      reason = 'Insufficient VUs (k6 could not start enough virtual users)';
    }
    if (reason) reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  if (reasons.size > 0) {
    console.log(`  k6 reported at ${rate}/s:`);
    [...reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([reason, count]) => console.log(`    ${count} x ${reason}`));
  }
  const stored = storedReadings(true); // counts, then clears

  const clean = achieved >= rate * 0.99 && dropped === 0 && p95 < 500 && failedPercent < 1 && accepted === stored;

  rows.push({
    'target/s': rate,
    'achieved/s': Math.round(achieved),
    'p95 (ms)': Math.round(p95),
    'failed %': Number(failedPercent.toFixed(1)),
    dropped,
    'no answer': failedNetwork,
    '5xx': failedServer,
    other: failedOther,
    accepted,
    stored,
    clean: clean ? 'YES' : 'no',
  });
});

console.log('');
console.table(rows);
const best = rows.filter((r) => r.clean === 'YES').map((r) => r['target/s']);
console.log(best.length ? `Highest clean rate: ${Math.max(...best)} requests per second` : 'No step was fully clean.');
console.log('"clean" = full rate reached, nothing dropped, p95 under 500 ms, under 1% failed, accepted = stored.');
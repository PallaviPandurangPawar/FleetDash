// Backend/tests/integration/redisFailover.test.js
// Live updates must keep flowing when a Redis Cluster node goes down.
// Runs only in cluster mode (otherwise it is skipped). Takes about 1 to 3 minutes.
//   1. in the repository root:  docker compose --profile cluster up -d redis-cluster-init
//   2. in the Backend folder:   set REDIS_MODE=cluster
//                               npx jest tests/integration/redisFailover.test.js
//
// Three situations are tested:
//  1. the node the subscriber is connected to is stopped (SHUTDOWN; Docker restarts it after 1 to 2 seconds)
//  2. a primary node is stopped the same way
//  3. a primary freezes for 12 seconds, longer than the cluster timeout (5 s): the cluster must promote its
//     replica (a real failover). This uses DEBUG SLEEP, which the Compose cluster allows (--enable-debug-command).
// No Docker command is needed in the test, so the same test runs on a PC and in CI.
const Redis = require('ioredis');
const { settings, createClient } = require('../../src/config/redis');

const describeCluster = settings.mode === 'cluster' ? describe : describe.skip;
const CHANNEL = 'test:failover';
const MAX_SILENCE_MS = 15000; // the longest time without any update that we accept during a node failure

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastReport = null; // what the last health check saw, shown when a wait runs out of time

async function waitFor(check, timeoutMs, what, everyMs = 100) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out after ${timeoutMs} ms waiting for: ${what}. Last cluster check: ${JSON.stringify(lastReport)}`
      );
    }
    await sleep(everyMs);
  }
}

// A plain connection to ONE node (no cluster logic, no automatic reconnect, gives up after 2 seconds)
function connectTo({ host, port }) {
  const node = new Redis({
    host,
    port,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    commandTimeout: 2000,
  });
  node.on('error', () => {});
  return node;
}

// Stops the Redis process of one node. The connection closes while the node stops, so an error here is expected.
async function stopNode(address) {
  const node = connectTo(address);
  try {
    await node.shutdown('NOSAVE');
  } catch (_err) {
    // expected
  } finally {
    node.disconnect();
  }
}

// "master" or "slave", as the node itself says
async function roleOf(address) {
  const node = connectTo(address);
  try {
    const reply = await node.call('ROLE');
    return reply[0];
  } finally {
    node.disconnect();
  }
}

const addressOf = (node) => ({ host: node.options.host, port: node.options.port });

describeCluster('Redis Cluster: live updates when a node goes down', () => {
  let publisher;
  let subscriber;
  let timer;
  let allNodes; // the 6 node addresses, noted before anything is stopped
  let nextSeq = 0;
  const sentAt = new Map(); // message number -> time it was sent
  const receivedAt = new Map(); // message number -> time it arrived

  // true when a message that was SENT after time t has arrived
  const deliveredAfter = (t) => [...receivedAt.keys()].some((seq) => sentAt.get(seq) >= t);

  // The longest time between two arrivals (or the start/end of the window) = how long the updates stopped
  function longestSilence(fromMs, toMs) {
    const arrivals = [...receivedAt.values()].filter((t) => t >= fromMs && t <= toMs).sort((a, b) => a - b);
    const times = [fromMs, ...arrivals, toMs];
    let longest = 0;
    for (let i = 1; i < times.length; i++) longest = Math.max(longest, times[i] - times[i - 1]);
    return longest;
  }

  // The address of a node that really is a primary right now (asked from the nodes, not from the client's list)
  async function findPrimary(excludePort) {
    for (const address of allNodes) {
      if (address.port === excludePort) continue;
      try {
        if ((await roleOf(address)) === 'master') return address;
      } catch (_err) {
        // this node does not answer
      }
    }
    throw new Error('no primary node answers');
  }

  // Asks every node directly (not through the cluster client) and reads the cluster state from the first one that answers
  async function readCluster() {
    let answering = 0;
    let unsynced = 0; // replicas that are not yet connected to (and copying from) their primary
    let info = '';
    let nodeList = '';
    for (const address of allNodes) {
      const node = connectTo(address);
      try {
        await node.ping();
        answering++;
        const replication = await node.info('replication');
        if (/role:slave/.test(replication) && !/master_link_status:up/.test(replication)) unsynced++;
        if (!info) {
          info = await node.cluster('INFO');
          nodeList = await node.cluster('NODES');
        }
      } catch (_err) {
        // this node does not answer
      } finally {
        node.disconnect();
      }
    }

    const lines = nodeList.split('\n').filter((line) => line.trim());
    const flagsOf = (line) => (line.split(' ')[2] || '').split(',');
    return {
      answering,
      unsynced,
      state: (/cluster_state:(\w+)/.exec(info) || [])[1] || 'unknown',
      slotsOk: Number((/cluster_slots_ok:(\d+)/.exec(info) || [])[1] || 0),
      primaries: lines.filter((line) => flagsOf(line).includes('master')).length,
      replicas: lines.filter((line) => flagsOf(line).includes('slave')).length,
      failed: lines.filter((line) => flagsOf(line).some((flag) => flag.startsWith('fail'))).length,
    };
  }

  // All 6 nodes answer, every slot is served, 3 primaries and 3 replicas, no node marked as failed
  async function healed() {
    lastReport = await readCluster();
    const r = lastReport;
    return (
      r.answering === 6 &&
      r.state === 'ok' &&
      r.slotsOk === 16384 &&
      r.primaries === 3 &&
      r.replicas === 3 &&
      r.failed === 0 &&
      r.unsynced === 0
    );
  }

  beforeAll(async () => {
    publisher = createClient('failover-pub');
    subscriber = createClient('failover-sub', { enableOfflineQueue: true });
    subscriber.on('message', (_channel, message) => receivedAt.set(Number(message), Date.now()));

    await waitFor(() => publisher.status === 'ready', 15000, 'the cluster to be ready (is it started? see the top of this file)');
    allNodes = publisher.nodes('all').map(addressOf);
    expect(allNodes).toHaveLength(6);
    await waitFor(healed, 30000, 'the cluster to be healthy before the test starts', 500);

    await subscriber.subscribe(CHANNEL);

    // A new numbered message every 100 ms, the way a vehicle sends positions
    timer = setInterval(() => {
      const seq = ++nextSeq;
      sentAt.set(seq, Date.now());
      publisher.publish(CHANNEL, String(seq)).catch(() => {}); // a failed send is fine: the next one follows
    }, 100);

    await waitFor(() => receivedAt.size > 5, 15000, 'the first updates to arrive');
  });

  afterAll(() => {
    clearInterval(timer);
    publisher.disconnect();
    subscriber.disconnect();
  });

  test(
    'updates keep flowing when the node the subscriber is connected to is stopped',
    async () => {
      await waitFor(() => subscriber.subscriber && subscriber.subscriber.getInstance(), 5000, 'the subscriber connection');
      const address = addressOf(subscriber.subscriber.getInstance());

      const stoppedAt = Date.now();
      await stopNode(address);

      // the subscriber moves to another node on its own
      await waitFor(() => deliveredAfter(stoppedAt), 30000, 'an update sent after the subscriber node was stopped');

      await waitFor(healed, 90000, 'the cluster to be healthy again', 500); // Docker restarts the node
      const healedAt = Date.now();
      await waitFor(() => deliveredAfter(healedAt), 10000, 'an update sent after the cluster healed');

      const silence = longestSilence(stoppedAt, Date.now());
      console.log(`[failover] subscriber node stopped: longest time without an update ${silence} ms`);
      expect(silence).toBeLessThan(MAX_SILENCE_MS);
    },
    150000
  );

  test(
    'updates keep flowing when a primary node is stopped',
    async () => {
      const address = await findPrimary(null);

      const stoppedAt = Date.now();
      await stopNode(address);

      await waitFor(() => deliveredAfter(stoppedAt), 30000, 'an update sent after the primary was stopped');

      await waitFor(healed, 90000, 'the cluster to be healthy again', 500);
      const healedAt = Date.now();
      await waitFor(() => deliveredAfter(healedAt), 10000, 'an update sent after the cluster healed');

      const silence = longestSilence(stoppedAt, Date.now());
      console.log(`[failover] primary stopped: longest time without an update ${silence} ms`);
      expect(silence).toBeLessThan(MAX_SILENCE_MS);
    },
    150000
  );

  test(
    'a primary freezes for longer than the cluster timeout: its replica takes over and updates keep flowing',
    async () => {
      await waitFor(() => subscriber.subscriber && subscriber.subscriber.getInstance(), 5000, 'the subscriber connection');
      const subscriberPort = subscriber.subscriber.getInstance().options.port;

      // A primary that is NOT the node the subscriber listens on, so this test is only about the cluster itself
      const address = await findPrimary(subscriberPort);
      expect(await roleOf(address)).toBe('master');

      const frozen = connectTo(address);
      const frozenAt = Date.now();
      // The node answers nothing for 12 seconds. The cluster timeout is 5 seconds, so the other nodes mark it as
      // failed and its replica takes over. (The call itself gives up after 2 seconds on our side: that is expected.)
      frozen.call('DEBUG', 'SLEEP', '12').catch(() => {});

      await waitFor(() => deliveredAfter(frozenAt), 30000, 'an update sent after the primary froze');

      await waitFor(healed, 90000, 'the cluster to be healthy again', 500);
      frozen.disconnect();
      const healedAt = Date.now();
      await waitFor(() => deliveredAfter(healedAt), 10000, 'an update sent after the cluster healed');

      // The frozen node woke up and found that its replica had taken over: it is a replica now
      expect(await roleOf(address)).toBe('slave');

      const silence = longestSilence(frozenAt, Date.now());
      console.log(`[failover] primary frozen, replica took over: longest time without an update ${silence} ms`);
      expect(silence).toBeLessThan(MAX_SILENCE_MS);
    },
    150000
  );
});
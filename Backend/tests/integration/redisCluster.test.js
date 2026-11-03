// Backend/tests/integration/redisCluster.test.js
// Checks the Redis Cluster itself. Runs only in cluster mode (otherwise it is skipped):
//   docker compose --profile cluster up -d redis-cluster-init     (once; wait until the nodes are healthy)
//   set REDIS_MODE=cluster
//   npx jest tests/integration/redisCluster.test.js
const Redis = require('ioredis');
const { settings, createClient } = require('../../src/config/redis');

const describeCluster = settings.mode === 'cluster' ? describe : describe.skip;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, timeoutMs = 10000) {
  const start = Date.now();
  for (;;) {
    if (await check()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(50);
  }
}

// Publishes again and again until the subscriber has received something (a subscription needs a moment to be active)
async function publishUntilReceived(publishFn, received, attempts = 50) {
  for (let i = 0; i < attempts && received.length === 0; i++) {
    await publishFn();
    await sleep(100);
  }
}

describeCluster('Redis Cluster', () => {
  let cluster;
  const opened = [];

  beforeAll(async () => {
    cluster = createClient('test-cluster');
    opened.push(cluster);
    await waitFor(() => cluster.status === 'ready', 15000); // if this hangs, start the cluster (see the top of this file)
  });

  afterAll(() => {
    opened.forEach((client) => client.disconnect());
  });

  test(
    'is healthy: every slot is covered, 3 primaries and 3 replicas',
    async () => {
      const info = await cluster.cluster('INFO');

      expect(info).toMatch(/cluster_state:ok/);
      expect(info).toMatch(/cluster_slots_assigned:16384/);
      expect(info).toMatch(/cluster_known_nodes:6/);

      // A replica that has just been restarted, or is still copying from its primary, is not in the cluster's slot
      // list yet. The client learns about it with the next refresh, so wait for that (and refresh) instead of
      // checking only once.
      await waitFor(async () => {
        if (cluster.nodes('master').length === 3 && cluster.nodes('slave').length === 3) return true;
        await new Promise((resolve) => {
          cluster.refreshSlotsCache(() => resolve());
          setTimeout(resolve, 2000);
        });
        return false;
      }, 60000);

      expect(cluster.nodes('master')).toHaveLength(3);
      expect(cluster.nodes('slave')).toHaveLength(3);
    },
    70000
  );

  test('a message published through the cluster client reaches a cluster subscriber', async () => {
    const subscriber = createClient('test-cluster-sub', { enableOfflineQueue: true });
    opened.push(subscriber);
    const received = [];
    subscriber.on('message', (_channel, message) => received.push(message));
    await subscriber.subscribe('test:cluster-check');

    await publishUntilReceived(() => cluster.publish('test:cluster-check', 'hello'), received);

    expect(received[0]).toBe('hello');
  });

  test('a message published on one node reaches a subscriber connected to another node', async () => {
    const nodes = cluster.nodes('all');
    const [a, b] = [nodes[0], nodes[nodes.length - 1]].map((node) => ({
      host: node.options.host,
      port: node.options.port,
    }));
    expect(a.port).not.toBe(b.port);

    const subscriber = new Redis({ ...a, maxRetriesPerRequest: 1 });
    const publisher = new Redis({ ...b, maxRetriesPerRequest: 1 });
    subscriber.on('error', () => {});
    publisher.on('error', () => {});
    opened.push(subscriber, publisher);

    const received = [];
    subscriber.on('message', (_channel, message) => received.push(message));
    await subscriber.subscribe('test:cluster-nodes');

    await publishUntilReceived(() => publisher.publish('test:cluster-nodes', 'across nodes'), received);

    expect(received[0]).toBe('across nodes');
  });
});
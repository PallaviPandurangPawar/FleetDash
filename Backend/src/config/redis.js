const Redis = require('ioredis');

// ---------------------------------------------------------------------------------------------
// Settings
//   REDIS_MODE=single    one Redis server at REDIS_URL (default)
//   REDIS_MODE=cluster   a Redis Cluster. REDIS_CLUSTER_NODES lists start nodes as host:port, separated by commas.
//                        Left empty, the Docker Compose cluster on this PC is used (127.0.0.1, ports 7001 to 7003).
//   REDIS_CLUSTER_NAT    "docker-host" or "none". A Redis Cluster tells clients the addresses of its nodes as they are
//                        INSIDE Docker (10.66.77.x), which a backend on your PC cannot reach. "docker-host" translates
//                        them to 127.0.0.1:7001 to 7006. Default: docker-host when REDIS_CLUSTER_NODES is empty, else none.
// ---------------------------------------------------------------------------------------------
const DEFAULT_URL = 'redis://127.0.0.1:6379';
const COMPOSE_START_NODES = '127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003';

// The 6 nodes of docker-compose.yml: fixed address inside Docker -> port on this PC
const COMPOSE_NAT_MAP = Object.fromEntries(
  Array.from({ length: 6 }, (_, i) => [`10.66.77.${11 + i}:6379`, { host: '127.0.0.1', port: 7001 + i }])
);

/** "host:port,host:port" -> [{ host, port }] */
function parseNodes(text) {
  const nodes = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.+):(\d{1,5})$/.exec(part);
      const port = match ? Number(match[2]) : 0;
      if (!match || port < 1 || port > 65535) {
        throw new Error(`REDIS_CLUSTER_NODES: "${part}" is not a host:port address`);
      }
      return { host: match[1], port };
    });

  if (nodes.length === 0) throw new Error('REDIS_CLUSTER_NODES must contain at least one host:port address');
  return nodes;
}

/** Reads the Redis settings from the environment. Throws a clear error for a wrong value. */
function getRedisSettings(env = process.env) {
  const mode = (env.REDIS_MODE || 'single').trim().toLowerCase();
  if (mode !== 'single' && mode !== 'cluster') {
    throw new Error(`REDIS_MODE must be "single" or "cluster", not "${env.REDIS_MODE}"`);
  }

  if (mode === 'single') {
    return { mode, url: env.REDIS_URL || DEFAULT_URL };
  }

  const nodesGiven = Boolean(env.REDIS_CLUSTER_NODES && env.REDIS_CLUSTER_NODES.trim());
  const nodes = parseNodes(nodesGiven ? env.REDIS_CLUSTER_NODES : COMPOSE_START_NODES);

  const nat = (env.REDIS_CLUSTER_NAT || (nodesGiven ? 'none' : 'docker-host')).trim().toLowerCase();
  if (nat !== 'none' && nat !== 'docker-host') {
    throw new Error(`REDIS_CLUSTER_NAT must be "none" or "docker-host", not "${env.REDIS_CLUSTER_NAT}"`);
  }

  return { mode, nodes, natMap: nat === 'docker-host' ? COMPOSE_NAT_MAP : undefined };
}

const settings = getRedisSettings();
const REDIS_URL = process.env.REDIS_URL || DEFAULT_URL;

/** A connection to the Redis Cluster (the cluster-aware client of ioredis) */
function createClusterClient(overrides) {
  const { enableOfflineQueue = false, maxRetriesPerRequest = 1, ...rest } = overrides;

  return new Redis.Cluster(settings.nodes, {
    natMap: settings.natMap,
    enableOfflineQueue, // false: fail fast instead of piling up commands while the cluster is down
    clusterRetryStrategy: (times) => Math.min(times * 200, 3000),
    redisOptions: { maxRetriesPerRequest },
    ...rest,
  });
}

/**
 * Creates a Redis connection (to one server or to the cluster, depending on REDIS_MODE).
 * Separate connections are used for publishing and subscribing because a subscribed
 * connection can't run normal commands.
 */
function createClient(name, overrides = {}) {
  const client =
    settings.mode === 'cluster'
      ? createClusterClient(overrides)
      : new Redis(REDIS_URL, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false, // fail fast instead of piling up commands when Redis is down
          retryStrategy: (times) => Math.min(times * 200, 3000),
          ...overrides,
        });

  client.on('connect', () => console.log(`[Redis:${name}] connected`));
  client.on('error', (err) => console.error(`[Redis:${name}] ${err.message}`));

  return client;
}

module.exports = { createClient, getRedisSettings, settings, REDIS_URL };
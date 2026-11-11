// Backend/tests/unit/redisConfig.test.js
// Tests for the Redis settings (single or cluster). Needs nothing running: it only reads settings.
const { getRedisSettings } = require('../../src/config/redis');

describe('getRedisSettings', () => {
  test('uses one Redis server by default', () => {
    expect(getRedisSettings({})).toEqual({ mode: 'single', url: 'redis://127.0.0.1:6379' });
  });

  test('single mode uses REDIS_URL', () => {
    expect(getRedisSettings({ REDIS_MODE: 'single', REDIS_URL: 'redis://redis:6379' })).toEqual({
      mode: 'single',
      url: 'redis://redis:6379',
    });
  });

  test('the mode ignores capital letters and spaces', () => {
    expect(getRedisSettings({ REDIS_MODE: ' Cluster ' }).mode).toBe('cluster');
  });

  test('cluster mode without a node list uses the Docker Compose cluster on this PC', () => {
    const settings = getRedisSettings({ REDIS_MODE: 'cluster' });

    expect(settings.mode).toBe('cluster');
    expect(settings.nodes).toEqual([
      { host: '127.0.0.1', port: 7001 },
      { host: '127.0.0.1', port: 7002 },
      { host: '127.0.0.1', port: 7003 },
    ]);
    // the 6 Docker-internal addresses are translated to ports 7001 to 7006 on this PC
    expect(Object.keys(settings.natMap)).toHaveLength(6);
    expect(settings.natMap['10.66.77.11:6379']).toEqual({ host: '127.0.0.1', port: 7001 });
    expect(settings.natMap['10.66.77.16:6379']).toEqual({ host: '127.0.0.1', port: 7006 });
  });

  test('a given node list is used as it is, without address translation', () => {
    const settings = getRedisSettings({
      REDIS_MODE: 'cluster',
      REDIS_CLUSTER_NODES: 'redis-node-1:6379, redis-node-2:6380',
    });

    expect(settings.nodes).toEqual([
      { host: 'redis-node-1', port: 6379 },
      { host: 'redis-node-2', port: 6380 },
    ]);
    expect(settings.natMap).toBeUndefined();
  });

  test('REDIS_CLUSTER_NAT can switch the address translation on', () => {
    const settings = getRedisSettings({
      REDIS_MODE: 'cluster',
      REDIS_CLUSTER_NODES: '127.0.0.1:7001',
      REDIS_CLUSTER_NAT: 'docker-host',
    });
    expect(Object.keys(settings.natMap)).toHaveLength(6);
  });

  test('REDIS_CLUSTER_NAT can switch the address translation off', () => {
    const settings = getRedisSettings({ REDIS_MODE: 'cluster', REDIS_CLUSTER_NAT: 'none' });
    expect(settings.natMap).toBeUndefined();
  });

  test.each(['sentinel', 'clustr'])('rejects the unknown mode %p', (mode) => {
    expect(() => getRedisSettings({ REDIS_MODE: mode })).toThrow('REDIS_MODE must be "single" or "cluster"');
  });

  test('rejects an unknown REDIS_CLUSTER_NAT', () => {
    expect(() => getRedisSettings({ REDIS_MODE: 'cluster', REDIS_CLUSTER_NAT: 'maybe' })).toThrow(
      'REDIS_CLUSTER_NAT must be "none" or "docker-host"'
    );
  });

  test.each(['nope', 'host:abc', 'host:0', 'host:70000', 'host:'])('rejects the node address %p', (address) => {
    expect(() => getRedisSettings({ REDIS_MODE: 'cluster', REDIS_CLUSTER_NODES: address })).toThrow(
      'is not a host:port address'
    );
  });
});
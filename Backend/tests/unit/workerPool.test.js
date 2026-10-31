// Backend/tests/unit/workerPool.test.js
// Tests how the worker pool copes with failing, crashing, stopping and hanging workers.
const path = require('path');
const defaultPool = require('../../src/workers/workerPool');

const { WorkerPool } = defaultPool;
const TEST_WORKER = path.join(__dirname, '../helpers/testWorker.js');

let pool;

beforeAll(() => {
  pool = new WorkerPool(TEST_WORKER, 1); // one worker makes the recovery easy to see
});

afterAll(async () => {
  await pool.terminate();
  await defaultPool.terminate(); // the pool the app creates when workerPool.js is loaded
});

beforeEach(() => {
  // The pool reports the crashes the tests cause on purpose; keep the output quiet
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WorkerPool', () => {
  test('runs a task and returns its data', async () => {
    await expect(pool.runTask('ECHO', { a: 1 }, 3000)).resolves.toEqual({ a: 1 });
  });

  test('rejects with the worker message when a task reports a failure', async () => {
    await expect(pool.runTask('FAIL', {}, 3000)).rejects.toThrow('task failed on purpose');
  });

  test('queues tasks while the worker is busy and answers all of them', async () => {
    const results = await Promise.all([1, 2, 3].map((n) => pool.runTask('ECHO', n, 3000)));
    expect(results).toEqual([1, 2, 3]);
  });

  test('rejects when the worker crashes, and works normally afterwards', async () => {
    await expect(pool.runTask('THROW', {}, 3000)).rejects.toThrow('worker crashed on purpose');

    // The new task must not be lost on the dead worker: it waits for the replacement
    await expect(pool.runTask('ECHO', { b: 2 }, 3000)).resolves.toEqual({ b: 2 });
  });

  test('rejects at once when the worker stops in the middle of a task', async () => {
    const start = Date.now();

    await expect(pool.runTask('EXIT', {}, 5000)).rejects.toThrow('stopped unexpectedly');

    expect(Date.now() - start).toBeLessThan(2500); // not the whole 5 second timeout
    await expect(pool.runTask('ECHO', { c: 3 }, 3000)).resolves.toEqual({ c: 3 });
  });

  test('a task that never answers times out, and its stuck worker is replaced', async () => {
    await expect(pool.runTask('HANG', {}, 300)).rejects.toThrow('timed out after 300ms');

    // Before the fix the stuck worker stayed busy forever and this task would time out too
    await expect(pool.runTask('ECHO', { d: 4 }, 3000)).resolves.toEqual({ d: 4 });
  });

  test('reports its state', async () => {
    const stats = pool.getStats();

    expect(stats).toMatchObject({ poolSize: 1, activeWorkers: 0, idleWorkers: 1, pendingTasks: 0 });
    expect(stats.completedTasks).toBeGreaterThanOrEqual(5);
  });

  test('a terminated pool refuses new tasks', async () => {
    const shortLived = new WorkerPool(TEST_WORKER, 1);
    await shortLived.terminate();

    await expect(shortLived.runTask('ECHO', {}, 1000)).rejects.toThrow('terminated');
  });
});
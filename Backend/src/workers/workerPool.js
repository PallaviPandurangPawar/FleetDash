const { Worker } = require('worker_threads');
const path = require('path');
const config = require('../config/config');

class WorkerPool {
  constructor(workerScript, poolSize = config.workerPoolSize) {
    this.workerScript = workerScript;
    this.poolSize = poolSize;
    this.workers = [];
    this.taskQueue = [];
    this.taskCallbacks = new Map();
    this.taskCounter = 0;
    this.completedTasksCount = 0;
    this.isTerminated = false;

    this._initialize();
  }

  _initialize() {
    for (let i = 0; i < this.poolSize; i++) {
      this._createWorker(i);
    }
    console.log(`[WorkerPool] Initialized pool with ${this.poolSize} worker threads`);
  }

  _createWorker(index) {
    const worker = new Worker(this.workerScript);

    const workerEntry = {
      id: index,
      worker,
      isBusy: false,
      isDead: false, // true once the worker failed or was stopped: it must not get new tasks
      currentTaskId: null,
    };

    worker.on('message', (response) => {
      this._handleWorkerMessage(workerEntry, response);
    });

    worker.on('error', (err) => {
      console.error(`[WorkerPool] Worker #${index} encountered error:`, err);
      this._handleWorkerFailure(workerEntry, err);
    });

    worker.on('exit', (code) => {
      if (code !== 0 && !this.isTerminated) {
        console.warn(`[WorkerPool] Worker #${index} stopped with exit code ${code}. Respawning...`);
        // A task that was still running on this worker will never be answered, so fail it now
        this._handleWorkerFailure(workerEntry, new Error(`Worker #${index} stopped unexpectedly (exit code ${code})`));
        this._respawnWorker(index);
      }
    });

    this.workers[index] = workerEntry;
  }

  _respawnWorker(index) {
    try {
      this._createWorker(index);
      this._dispatchNext();
    } catch (err) {
      console.error(`[WorkerPool] Failed to respawn worker #${index}:`, err);
    }
  }

  _handleWorkerMessage(workerEntry, response) {
    const { taskId, success, data, error } = response;
    const callback = this.taskCallbacks.get(taskId);

    if (callback) {
      clearTimeout(callback.timeoutId);
      this.taskCallbacks.delete(taskId);
      this.completedTasksCount++;

      if (success) {
        callback.resolve(data);
      } else {
        callback.reject(new Error(error || 'Worker task failed'));
      }
    }

    workerEntry.isBusy = false;
    workerEntry.currentTaskId = null;
    this._dispatchNext();
  }

  _handleWorkerFailure(workerEntry, err) {
    workerEntry.isDead = true;

    if (workerEntry.currentTaskId) {
      const callback = this.taskCallbacks.get(workerEntry.currentTaskId);
      if (callback) {
        clearTimeout(callback.timeoutId);
        this.taskCallbacks.delete(workerEntry.currentTaskId);
        callback.reject(err);
      }
    }
    workerEntry.isBusy = false;
    workerEntry.currentTaskId = null;
  }

  _dispatchNext() {
    if (this.taskQueue.length === 0) return;

    const idleWorker = this.workers.find((w) => w && !w.isBusy && !w.isDead);
    if (!idleWorker) return;

    const task = this.taskQueue.shift();
    idleWorker.isBusy = true;
    idleWorker.currentTaskId = task.taskId;

    idleWorker.worker.postMessage({
      taskId: task.taskId,
      type: task.type,
      payload: task.payload,
    });
  }

  runTask(type, payload, timeoutMs = 30000) {
    if (this.isTerminated) {
      return Promise.reject(new Error('WorkerPool is already terminated'));
    }

    const taskId = `task_${++this.taskCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.taskCallbacks.has(taskId)) return;

        this.taskCallbacks.delete(taskId);
        this.taskQueue = this.taskQueue.filter((t) => t.taskId !== taskId);

        // If the task was running, its worker may be stuck for good: replace it
        const stuck = this.workers.find((w) => w && w.currentTaskId === taskId);
        if (stuck) {
          stuck.isDead = true;
          stuck.isBusy = false;
          stuck.currentTaskId = null;
          stuck.worker.terminate(); // its exit event starts a fresh worker
        }

        reject(new Error(`Worker task ${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.taskCallbacks.set(taskId, { resolve, reject, timeoutId });
      this.taskQueue.push({ taskId, type, payload });
      this._dispatchNext();
    });
  }

  getStats() {
    const activeWorkers = this.workers.filter((w) => w && w.isBusy).length;
    return {
      poolSize: this.poolSize,
      activeWorkers,
      idleWorkers: this.poolSize - activeWorkers,
      pendingTasks: this.taskQueue.length,
      completedTasks: this.completedTasksCount,
    };
  }

  async terminate() {
    this.isTerminated = true;
    const terminations = this.workers.map((w) => w.worker.terminate());
    await Promise.all(terminations);
    console.log('[WorkerPool] All worker threads terminated cleanly');
  }
}

const analyticsWorkerPath = path.join(__dirname, 'analyticsWorker.js');
const pool = new WorkerPool(analyticsWorkerPath);

pool.WorkerPool = WorkerPool;
module.exports = pool;
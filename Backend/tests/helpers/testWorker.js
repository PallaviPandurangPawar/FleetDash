// A tiny worker thread for testing the worker pool: it can answer, fail, crash, exit or hang on purpose
const { parentPort } = require('worker_threads');

parentPort.on('message', ({ taskId, type, payload }) => {
  if (type === 'ECHO') return parentPort.postMessage({ taskId, success: true, data: payload });
  if (type === 'FAIL') return parentPort.postMessage({ taskId, success: false, error: 'task failed on purpose' });
  if (type === 'THROW') throw new Error('worker crashed on purpose');
  if (type === 'EXIT') return process.exit(1);
  // HANG (or any other type): never answers
});
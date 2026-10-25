const { parentPort } = require('worker_threads');
const { parseBatch } = require('../utils/validators');

if (parentPort) {
  parentPort.on('message', (task) => {
    const { taskId, type, payload } = task;
    try {
      let result;
      switch (type) {
        case 'parseBatch':
          result = parseBatch(payload.readings);
          break;
        default:
          throw new Error(`Unknown task type: ${type}`);
      }
      parentPort.postMessage({ taskId, success: true, data: result });
    } catch (error) {
      parentPort.postMessage({ taskId, success: false, error: error.message });
    }
  });
}
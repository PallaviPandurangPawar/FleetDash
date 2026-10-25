const path = require('path');
const { WorkerPool } = require('./workerPool');

const poolSize = parseInt(process.env.PARSE_POOL_SIZE, 10) || 2;

module.exports = new WorkerPool(path.join(__dirname, 'parseWorker.js'), poolSize);
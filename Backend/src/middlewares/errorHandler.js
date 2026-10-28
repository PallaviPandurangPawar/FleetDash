const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (statusCode >= 500) {
    // Real server problem: print the full error with stack trace
    logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, err);
  } else {
    // Client mistake (bad JSON, bad input): one short line is enough
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      status: statusCode,
      message,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
}

function notFoundHandler(_req, res) {
  res.status(404).json({
    success: false,
    error: {
      status: 404,
      message: 'Resource route not found',
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
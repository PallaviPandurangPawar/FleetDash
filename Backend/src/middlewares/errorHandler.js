const logger = require('../utils/logger');

// Turns known database errors into proper client errors instead of 500s
function statusFor(err) {
  if (err.status || err.statusCode) return err.status || err.statusCode;
  if (err.name === 'ValidationError' || err.name === 'CastError') return 400;
  if (err.code === 11000) return 409; // duplicate key
  return 500;
}

function errorHandler(err, req, res, _next) {
  const statusCode = statusFor(err);
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
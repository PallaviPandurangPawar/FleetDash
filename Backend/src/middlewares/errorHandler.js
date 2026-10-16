function errorHandler(err, _req, res, _next) {
  console.error('[Error Handler]', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

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

// Backend/src/middlewares/requireAdminKey.js
// Protects admin-only routes. The caller must send the secret in the "x-admin-key" header.
// The secret is the ADMIN_API_KEY environment variable.
const crypto = require('crypto');

// Hashing first gives both values the same length, which timingSafeEqual requires
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

// Passes a client error to the shared errorHandler (same JSON format as every other error)
function fail(next, status, message) {
  const err = new Error(message);
  err.status = status;
  return next(err);
}

function requireAdminKey(req, _res, next) {
  // Read at request time so tests and restarts always see the current value
  const expected = process.env.ADMIN_API_KEY;

  // No key configured: keep the admin API closed instead of open
  if (!expected) {
    return fail(next, 503, 'Admin API is disabled: ADMIN_API_KEY is not set on the server');
  }

  const provided = req.get('x-admin-key');
  if (!provided) {
    return fail(next, 401, 'Admin key required (send it in the x-admin-key header)');
  }

  if (!crypto.timingSafeEqual(sha256(provided), sha256(expected))) {
    return fail(next, 401, 'Invalid admin key');
  }

  next();
}

module.exports = { requireAdminKey };
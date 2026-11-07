// Backend/tests/unit/requireAdminKey.test.js
// Unit tests for the admin key middleware. No database needed.
const { requireAdminKey } = require('../../src/middlewares/requireAdminKey');

const ORIGINAL_KEY = process.env.ADMIN_API_KEY;

// A minimal request: req.get() reads the headers we give it
const makeReq = (headers = {}) => ({
  get: (name) => headers[name.toLowerCase()],
});

// Runs the middleware once and returns what it passed to next() (an error, or nothing)
function run(headers) {
  const next = jest.fn();
  requireAdminKey(makeReq(headers), {}, next);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0][0];
}

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = ORIGINAL_KEY;
});

describe('requireAdminKey', () => {
  test('stays closed (503) when no key is configured, even if a key is sent', () => {
    delete process.env.ADMIN_API_KEY;
    expect(run({ 'x-admin-key': 'anything' }).status).toBe(503);
  });

  test('treats an empty ADMIN_API_KEY as "not configured"', () => {
    process.env.ADMIN_API_KEY = '';
    expect(run({ 'x-admin-key': '' }).status).toBe(503);
  });

  test('rejects a request without the header (401)', () => {
    process.env.ADMIN_API_KEY = 'secret-key';
    const err = run({});
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/Admin key required/);
  });

  test('rejects a wrong key (401), also when the length is different', () => {
    process.env.ADMIN_API_KEY = 'secret-key';
    expect(run({ 'x-admin-key': 'secret-kez' }).status).toBe(401);
    expect(run({ 'x-admin-key': 'short' }).status).toBe(401);
    expect(run({ 'x-admin-key': 'secret-key-and-more' }).status).toBe(401);
  });

  test('accepts the right key: next() is called without an error', () => {
    process.env.ADMIN_API_KEY = 'secret-key';
    expect(run({ 'x-admin-key': 'secret-key' })).toBeUndefined();
  });
});
// Backend/tests/unit/errorHandler.test.js
const { errorHandler, notFoundHandler } = require('../../src/middlewares/errorHandler');
const logger = require('../../src/utils/logger');

const savedEnv = process.env.NODE_ENV;
const req = { method: 'GET', originalUrl: '/api/x' };
let warnSpy;
let errorSpy;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function handle(err) {
  const res = makeRes();
  errorHandler(err, req, res, jest.fn());
  return res;
}

beforeEach(() => {
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env.NODE_ENV = savedEnv;
});

describe('errorHandler status codes', () => {
  test.each([
    ['an error with a status', Object.assign(new Error('bad json'), { status: 400 }), 400],
    ['an error with a statusCode', Object.assign(new Error('too big'), { statusCode: 413 }), 413],
    ['a Mongoose validation error', Object.assign(new Error('invalid'), { name: 'ValidationError' }), 400],
    ['a Mongoose cast error', Object.assign(new Error('bad id'), { name: 'CastError' }), 400],
    ['a duplicate key error', Object.assign(new Error('E11000 duplicate key'), { code: 11000 }), 409],
    ['an unknown error', new Error('boom'), 500],
  ])('maps %s to %i', (_name, err, expected) => {
    const res = handle(err);

    expect(res.status).toHaveBeenCalledWith(expected);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: expected, message: err.message },
    });
  });

  test('uses a default message when the error has none', () => {
    const res = handle({});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.message).toBe('Internal Server Error');
  });
});

describe('errorHandler logging', () => {
  test('a client error (4xx) logs one short warning', () => {
    handle(Object.assign(new Error('nope'), { status: 400 }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('a server error (5xx) logs the full error', () => {
    const err = new Error('boom');
    handle(err);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'), err);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('errorHandler stack traces', () => {
  test('are included only in development', () => {
    process.env.NODE_ENV = 'development';
    expect(handle(new Error('x')).json.mock.calls[0][0].error.stack).toEqual(expect.any(String));

    process.env.NODE_ENV = 'production';
    expect(handle(new Error('x')).json.mock.calls[0][0].error.stack).toBeUndefined();
  });
});

describe('notFoundHandler', () => {
  test('answers 404 in the standard error format', () => {
    const res = makeRes();
    notFoundHandler({}, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { status: 404, message: 'Resource route not found' },
    });
  });
});
// Backend/tests/unit/logger.test.js
const logger = require('../../src/utils/logger');

const savedLevel = process.env.LOG_LEVEL;
let log;
let warn;
let error;

beforeEach(() => {
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  error = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  if (savedLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = savedLevel;
});

function logAtEveryLevel() {
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
}

describe('logger levels', () => {
  test('is silent by default while tests run', () => {
    delete process.env.LOG_LEVEL;
    logAtEveryLevel();

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test('info shows info, warn and error but not debug', () => {
    process.env.LOG_LEVEL = 'info';
    logAtEveryLevel();

    expect(log).toHaveBeenCalledTimes(1); // info
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('debug shows everything', () => {
    process.env.LOG_LEVEL = 'debug';
    logAtEveryLevel();

    expect(log).toHaveBeenCalledTimes(2); // debug and info
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('warn shows warn and error only', () => {
    process.env.LOG_LEVEL = 'warn';
    logAtEveryLevel();

    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('error shows errors only', () => {
    process.env.LOG_LEVEL = 'error';
    logAtEveryLevel();

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('silent shows nothing, not even errors', () => {
    process.env.LOG_LEVEL = 'silent';
    logAtEveryLevel();

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test('the level name is not case sensitive', () => {
    process.env.LOG_LEVEL = 'WARN';
    logAtEveryLevel();

    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('an unknown level falls back to info', () => {
    process.env.LOG_LEVEL = 'loud';
    logAtEveryLevel();

    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('logger line format', () => {
  test('starts with an ISO time and the level, followed by the message parts', () => {
    process.env.LOG_LEVEL = 'info';
    logger.info('hello', 42);

    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] INFO$/), 'hello', 42);
  });

  test('warnings and errors use the matching console method', () => {
    process.env.LOG_LEVEL = 'info';
    logger.warn('careful');
    logger.error('broken');

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ WARN$/), 'careful');
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/ ERROR$/), 'broken');
  });
});
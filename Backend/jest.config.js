module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  forceExit: true, // the app opens Redis and worker connections that tests do not close
  testTimeout: 20000,
  // The suites share one test database and clean up "TEST-" data, so they must not run at the same time
  maxWorkers: 1,
};
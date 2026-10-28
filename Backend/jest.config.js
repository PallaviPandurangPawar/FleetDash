module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  // Test files that are still empty placeholders. Remove an entry here
  // when that file gets real tests.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/tests/unit/analyticsWorker.test.js',
    '<rootDir>/tests/unit/bucketService.test.js',
  ],
  forceExit: true, // the app opens Redis and worker connections that tests do not close
  testTimeout: 20000,
  // The suites share one test database and clean up "TEST-" data, so they must not run at the same time
  maxWorkers: 1,
};
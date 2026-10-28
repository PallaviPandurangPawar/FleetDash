module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  // Test files that are still empty placeholders. Remove an entry here
  // when that file gets real tests.
  testPathIgnorePatterns: [
    '/node_modules/',

    '<rootDir>/tests/integration/vehicles.test.js',
    '<rootDir>/tests/unit/analyticsWorker.test.js',
    '<rootDir>/tests/unit/bucketService.test.js',
  ],
  forceExit: true, // the app opens Redis and worker connections that tests do not close
  testTimeout: 20000,
};
// Runs before every test file.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';

// Small safety cap so the tests can fill a bucket quickly (the real default is 1000)
process.env.BUCKET_MAX_SIZE = '100';

// Tests must never touch the real or load-test database
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/fleetdash_test';
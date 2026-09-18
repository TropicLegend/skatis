// Environment for the test suite. Values are only defaults – an existing
// environment or `.env` file wins.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://skatis:skatis@localhost:5432/skatis_test?schema=public';
process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-validation';
process.env.LOG_LEVEL ??= 'silent';

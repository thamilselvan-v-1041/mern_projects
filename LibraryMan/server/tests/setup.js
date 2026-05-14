// Force in-memory store + mock-auth mode for the entire test run.
process.env.NODE_ENV = 'test';
process.env.USE_MEMORY_STORE = 'true';
process.env.ALLOWED_ORIGINS = '';

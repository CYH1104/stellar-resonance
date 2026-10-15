// Unified local backend; legacy launcher keeps port 8807.
process.env.PORT ||= '8807';
await import('./server/index.mjs');

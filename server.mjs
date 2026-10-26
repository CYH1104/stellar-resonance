// Unified local backend; legacy launcher keeps port 8807 and runs the stable channel.
process.env.PORT ||= '8807';
process.env.TERMINAL_CHANNEL ||= 'stable';
await import('./server/index.mjs');

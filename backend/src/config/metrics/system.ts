import client from 'prom-client';

export const dbConnectionCount = new client.Gauge({
  name: 'djs_db_connection_count',
  help: 'Current number of database connections',
});

export const redisConnectionCount = new client.Gauge({
  name: 'djs_redis_connection_count',
  help: 'Current number of redis connections',
});

export const buildInfo = new client.Gauge({
  name: 'djs_build_info',
  help: 'Information about the application build',
  labelNames: ['version', 'node', 'role'],
});

// Note: process_uptime_seconds and nodejs_eventloop_lag_seconds 
// are automatically exported by prom-client's collectDefaultMetrics()

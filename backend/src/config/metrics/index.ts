import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'djs_' });

export const metricsRegistry = client.register;

export * from './http';
export * from './worker';
export * from './scheduler';
export * from './queue';
export * from './retry';
export * from './dlq';
export * from './system';

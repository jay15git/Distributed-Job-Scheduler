import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { env } from './env';

export const otelSDK = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()],
});

// We only start this if explicitly requested or in production, 
// to avoid overhead during fast dev iteration unless needed.
export const startTelemetry = () => {
  if (env.NODE_ENV === 'production' || process.env.ENABLE_TELEMETRY === 'true') {
    otelSDK.start();
    console.log('✅ OpenTelemetry initialized');
  }
};

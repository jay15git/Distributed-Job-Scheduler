import 'express-async-errors'; // Catch async errors automatically
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'fs';
import path from 'path';

// Config
import { env } from '../config/env';
import { startTelemetry } from '../config/telemetry';

// Middlewares
import { requestIdMiddleware, correlationIdMiddleware } from '../middlewares/requestId';
import { loggingMiddleware } from '../middlewares/logger';
import { errorHandler } from '../middlewares/errorHandler';
import { contextMiddleware } from '../middlewares/context.middleware';
import { metricsMiddleware } from '../middlewares/metrics.middleware';

import { healthRouter } from '../routes/health.routes';
import { authRoutes } from '../routes/auth.routes';
import { organizationRoutes } from '../routes/organization.routes';
import { projectRoutes } from '../routes/project.routes';
import { queueRoutes } from '../routes/queue.routes';
import { jobRoutes } from '../routes/job.routes';
import { scheduledJobRoutes } from '../routes/scheduled-job.routes';
import { retryPolicyRoutes } from '../routes/retry-policy.routes';
import { apiKeyRoutes } from '../routes/apikey.routes';
import { workerRoutes } from '../routes/worker.routes';
import { NotFoundError } from '../errors';

// Bootstrap Telemetry
startTelemetry();

export const app: Application = express();

// 1. Request ID Generation
app.use(requestIdMiddleware);

// 2. Correlation ID Extraction/Generation
app.use(correlationIdMiddleware);

// 3. Security Middlewares
app.use(helmet());
app.use(cors());

// Context (AsyncLocalStorage)
app.use(contextMiddleware);

// 4. Request Logging & Timing
if (env.NODE_ENV !== 'test') {
  app.use(loggingMiddleware);
}

// HTTP Metrics
app.use(metricsMiddleware);

// 5. Body Parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Swagger UI Documentation — the repo-root docs/ copy is canonical; the
// legacy backend-local path is a fallback for packaged layouts.
try {
  const specPath = [
    path.resolve(__dirname, '../../../docs/api/openapi.yaml'),
    path.resolve(__dirname, '../../docs/api/openapi.yaml'),
  ].find(p => fs.existsSync(p));
  if (!specPath) throw new Error('openapi.yaml not found');
  const file = fs.readFileSync(specPath, 'utf8');
  const swaggerDocument = YAML.parse(file);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (error) {
  console.warn('Swagger documentation not found or failed to load:', error);
}

// 6. Routes
app.use('/', healthRouter); // Global health endpoints
const apiV1Router = express.Router();
// Register API routes here:
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/queues', queueRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/scheduled-jobs', scheduledJobRoutes);
app.use('/api/v1/retry-policies', retryPolicyRoutes);
app.use('/api/v1', apiKeyRoutes); // nested: /projects/:projectId/api-keys, /api-keys/:id/*
app.use('/api/v1/workers', workerRoutes);

app.use('/api/v1', apiV1Router);

// 7. 404 Handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((req, _res, _next) => {
  throw new NotFoundError(`Cannot ${req.method} ${req.url}`);
});

// 8. Global Error Handler
app.use(errorHandler);

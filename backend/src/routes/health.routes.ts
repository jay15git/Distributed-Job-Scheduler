import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

export const healthRouter = Router();

healthRouter.get('/health', HealthController.getHealth);
healthRouter.get('/metrics', HealthController.getMetrics);
healthRouter.get('/live', HealthController.getLive);
healthRouter.get('/ready', HealthController.getReady);
healthRouter.get('/version', HealthController.getVersion);

import { Router } from 'express';
import { WorkerController } from '../controllers/worker.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

router.get('/', WorkerController.list);

export { router as workerRoutes };

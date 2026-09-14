import { Router } from 'express';
import { WorkerController } from '../controllers/worker.controller';
import { requireAuthentication, requireScope } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

// Workers are global infrastructure, not org-scoped — any authenticated
// principal (or a WORKER_READ API key) may list them.
router.get('/', requireScope('WORKER_READ'), WorkerController.list);

export { router as workerRoutes };

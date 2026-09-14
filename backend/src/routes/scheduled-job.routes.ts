import { Router } from 'express';
import { ScheduledJobController } from '../controllers/scheduled-job.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

router.post('/', ScheduledJobController.create);
router.get('/', ScheduledJobController.list);
router.get('/:id', ScheduledJobController.get);
router.patch('/:id/status', ScheduledJobController.updateStatus);

export { router as scheduledJobRoutes };

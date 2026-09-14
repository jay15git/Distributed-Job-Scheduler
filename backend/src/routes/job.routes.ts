import { Router } from 'express';
import { JobController } from '../controllers/job.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

router.post('/', JobController.create);
router.get('/', JobController.list);
router.get('/:id', JobController.get);
router.post('/:id/replay', JobController.replay);

export { router as jobRoutes };

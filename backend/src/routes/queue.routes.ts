import { Router } from 'express';
import { QueueController } from '../controllers/queue.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

router.post('/', QueueController.create);
router.get('/', QueueController.list);
router.get('/:id', QueueController.get);
router.patch('/:id/status', QueueController.updateStatus);

export { router as queueRoutes };

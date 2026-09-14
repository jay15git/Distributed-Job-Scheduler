import { Router } from 'express';
import { QueueController } from '../controllers/queue.controller';
import { requireAuthentication, requireScope } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createQueueSchema, updateQueueStatusSchema, updateQueueRetryPolicySchema } from '../validators/queue.validator';

const router = Router();

router.use(requireAuthentication);

router.post(
  '/',
  validate(createQueueSchema),
  requireScope('QUEUE_WRITE'),
  orgScope(orgFrom.viaProject('projectId'), { write: true }),
  QueueController.create
);
router.get('/', requireScope('QUEUE_READ'), QueueController.list);
router.get('/:id', requireScope('QUEUE_READ'), orgScope(orgFrom.viaResource('queue')), QueueController.get);
router.patch(
  '/:id/status',
  validate(updateQueueStatusSchema),
  requireScope('QUEUE_WRITE'),
  orgScope(orgFrom.viaResource('queue'), { write: true }),
  QueueController.updateStatus
);
router.patch(
  '/:id/retry-policy',
  validate(updateQueueRetryPolicySchema),
  requireScope('QUEUE_WRITE'),
  orgScope(orgFrom.viaResource('queue'), { write: true }),
  QueueController.updateRetryPolicy
);

export { router as queueRoutes };

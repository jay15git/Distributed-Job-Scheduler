import { Router } from 'express';
import { ScheduledJobController } from '../controllers/scheduled-job.controller';
import { requireAuthentication, requireScope } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createScheduledJobSchema, updateScheduledJobStatusSchema } from '../validators/scheduled-job.validator';

const router = Router();

router.use(requireAuthentication);

router.post(
  '/',
  validate(createScheduledJobSchema),
  requireScope('JOB_WRITE'),
  orgScope([orgFrom.viaProject('projectId'), orgFrom.viaQueue('queueId')], { write: true }),
  ScheduledJobController.create
);
router.get('/', requireScope('JOB_READ'), ScheduledJobController.list);
router.get('/:id', requireScope('JOB_READ'), orgScope(orgFrom.viaResource('scheduledJob')), ScheduledJobController.get);
router.patch(
  '/:id/status',
  validate(updateScheduledJobStatusSchema),
  requireScope('JOB_WRITE'),
  orgScope(orgFrom.viaResource('scheduledJob'), { write: true }),
  ScheduledJobController.updateStatus
);

export { router as scheduledJobRoutes };

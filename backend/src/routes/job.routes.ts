import { Router } from 'express';
import { JobController } from '../controllers/job.controller';
import { requireAuthentication, requireScope } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createJobSchema, listJobsSchema } from '../validators/job.validator';

const router = Router();

router.use(requireAuthentication);

// List is scoped inside the controller (member-org filter / apiKey project).
router.post(
  '/',
  validate(createJobSchema),
  requireScope('JOB_WRITE'),
  orgScope(orgFrom.viaQueue('queueId'), { write: true }),
  JobController.create
);
router.get('/', validate(listJobsSchema), requireScope('JOB_READ'), JobController.list);
router.get('/:id', requireScope('JOB_READ'), orgScope(orgFrom.viaResource('job')), JobController.get);
router.post(
  '/:id/replay',
  requireScope('JOB_RETRY'),
  orgScope(orgFrom.viaResource('job'), { write: true }),
  JobController.replay
);
router.post(
  '/:id/cancel',
  requireScope('JOB_WRITE'),
  orgScope(orgFrom.viaResource('job'), { write: true }),
  JobController.cancel
);

export { router as jobRoutes };

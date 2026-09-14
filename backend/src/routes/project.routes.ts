import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { requireAuthentication, requireScope } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createProjectSchema } from '../validators/resource.validator';

const router = Router();

router.use(requireAuthentication);

router.post(
  '/',
  validate(createProjectSchema),
  requireScope('PROJECT_WRITE'),
  orgScope(orgFrom.param('organizationId'), { write: true }),
  ProjectController.create
);
// List is tenant-filtered inside the controller (member orgs / key project).
router.get('/', requireScope('PROJECT_READ'), ProjectController.list);
router.get('/:id', requireScope('PROJECT_READ'), orgScope(orgFrom.viaResource('project')), ProjectController.get);

export { router as projectRoutes };

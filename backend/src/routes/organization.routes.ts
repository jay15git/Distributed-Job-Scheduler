import { Router } from 'express';
import { OrganizationController } from '../controllers/organization.controller';
import { requireAuthentication, requireScope, requireUser } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createOrganizationSchema } from '../validators/resource.validator';

const router = Router();

router.use(requireAuthentication);

// Any verified user can create an org (they become its ORG_ADMIN).
router.post('/', requireUser, validate(createOrganizationSchema), OrganizationController.create);
// List is already member-filtered inside the controller.
router.get('/', requireScope('ORGANIZATION_READ'), OrganizationController.list);
router.get('/:id', requireScope('ORGANIZATION_READ'), orgScope(orgFrom.viaResource('organization')), OrganizationController.get);

export { router as organizationRoutes };

import { Router } from 'express';
import { OrganizationController } from '../controllers/organization.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

router.post('/', OrganizationController.create);
router.get('/', OrganizationController.list);
router.get('/:id', OrganizationController.get);

export { router as organizationRoutes };

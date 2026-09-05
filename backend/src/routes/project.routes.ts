import { Router } from 'express';
import { ProjectController } from '../controllers/project.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

router.post('/', ProjectController.create);
router.get('/', ProjectController.list);
router.get('/:id', ProjectController.get);

export { router as projectRoutes };

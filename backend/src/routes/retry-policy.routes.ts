import { Router } from 'express';
import { RetryPolicyController } from '../controllers/retry-policy.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuthentication);

router.post('/', RetryPolicyController.create);
router.get('/', RetryPolicyController.list);
router.get('/:id', RetryPolicyController.get);
router.patch('/:id', RetryPolicyController.update);
router.delete('/:id', RetryPolicyController.remove);

export { router as retryPolicyRoutes };

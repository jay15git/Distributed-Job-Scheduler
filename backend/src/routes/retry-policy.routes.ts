import { Router } from 'express';
import { RetryPolicyController } from '../controllers/retry-policy.controller';
import { requireAuthentication } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createRetryPolicySchema, updateRetryPolicySchema, listRetryPoliciesSchema } from '../validators/retry-policy.validator';

const router = Router();

router.use(requireAuthentication);

router.post(
  '/',
  validate(createRetryPolicySchema),
  orgScope(orgFrom.param('organizationId'), { write: true }),
  RetryPolicyController.create
);
router.get('/', validate(listRetryPoliciesSchema), orgScope(orgFrom.param('organizationId')), RetryPolicyController.list);
router.get('/:id', orgScope(orgFrom.viaResource('retryPolicy')), RetryPolicyController.get);
router.patch('/:id', validate(updateRetryPolicySchema), orgScope(orgFrom.viaResource('retryPolicy'), { write: true }), RetryPolicyController.update);
router.delete('/:id', orgScope(orgFrom.viaResource('retryPolicy'), { write: true }), RetryPolicyController.remove);

export { router as retryPolicyRoutes };

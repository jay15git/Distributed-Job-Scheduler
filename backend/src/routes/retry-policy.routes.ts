import { Router } from 'express';
import { RetryPolicyController } from '../controllers/retry-policy.controller';
import { requireAuthentication, requireScope } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createRetryPolicySchema, updateRetryPolicySchema, listRetryPoliciesSchema } from '../validators/retry-policy.validator';

const router = Router();

router.use(requireAuthentication);

// Retry policies configure queue behavior — they gate on the QUEUE_* scopes
// so a read-only key cannot mutate org policy.
router.post(
  '/',
  validate(createRetryPolicySchema),
  requireScope('QUEUE_WRITE'),
  orgScope(orgFrom.param('organizationId'), { write: true }),
  RetryPolicyController.create
);
router.get('/', validate(listRetryPoliciesSchema), requireScope('QUEUE_READ'), orgScope(orgFrom.param('organizationId')), RetryPolicyController.list);
router.get('/:id', requireScope('QUEUE_READ'), orgScope(orgFrom.viaResource('retryPolicy')), RetryPolicyController.get);
router.patch('/:id', validate(updateRetryPolicySchema), requireScope('QUEUE_WRITE'), orgScope(orgFrom.viaResource('retryPolicy'), { write: true }), RetryPolicyController.update);
router.delete('/:id', requireScope('QUEUE_WRITE'), orgScope(orgFrom.viaResource('retryPolicy'), { write: true }), RetryPolicyController.remove);

export { router as retryPolicyRoutes };

import { Router } from 'express';
import { ApiKeyController } from '../controllers/apikey.controller';
import { requireAuthentication, requireUser } from '../middlewares/auth.middleware';
import { orgScope, orgFrom } from '../middlewares/rbac.middleware';
import { validate } from '../middlewares/validate';
import { createApiKeySchema, revokeApiKeySchema } from '../validators/apikey.validator';

const router = Router();

// API keys are managed by humans — JWT only, no X-API-Key self-service.
router.use(requireAuthentication, requireUser);

router.post(
  '/projects/:projectId/api-keys',
  validate(createApiKeySchema),
  orgScope(orgFrom.viaProject('projectId'), { write: true }),
  ApiKeyController.create
);
router.get(
  '/projects/:projectId/api-keys',
  orgScope(orgFrom.viaProject('projectId')),
  ApiKeyController.list
);
router.post(
  '/api-keys/:id/revoke',
  validate(revokeApiKeySchema),
  orgScope(orgFrom.viaResource('apiKey'), { write: true }),
  ApiKeyController.revoke
);
router.post(
  '/api-keys/:id/regenerate',
  orgScope(orgFrom.viaResource('apiKey'), { write: true }),
  ApiKeyController.regenerate
);
router.delete(
  '/api-keys/:id',
  orgScope(orgFrom.viaResource('apiKey'), { write: true }),
  ApiKeyController.remove
);

export { router as apiKeyRoutes };

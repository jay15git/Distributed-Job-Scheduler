import { z } from 'zod';
import { ApiKeyScope } from '@prisma/client';

export const createApiKeySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    scopes: z.array(z.nativeEnum(ApiKeyScope)).min(1),
    expiresAt: z.string().datetime().optional(),
  }),
});

export const revokeApiKeySchema = z.object({
  body: z.object({
    reason: z.string().max(500).optional(),
  }).optional().default({}),
});

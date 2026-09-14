import { z } from 'zod';
import { Environment } from '@prisma/client';

export const createProjectSchema = z.object({
  body: z.object({
    organizationId: z.string().uuid('organizationId must be a UUID'),
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    environment: z.nativeEnum(Environment).optional(),
  }),
});

export const createOrganizationSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  }),
});

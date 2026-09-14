import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { Role } from '@prisma/client';
import { prisma } from '../database/db';

declare global {
// eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        projectId: string;
        scopes: string[];
      };
      orgMembership?: {
        organizationId: string;
        role: Role;
      };
      /** Organization resolved by orgScope for this request's resource(s). */
      organizationId?: string;
    }
  }
}

type ScopeResolution = { organizationId: string; projectId?: string | null };
type OrgResolver = (req: Request) => Promise<ScopeResolution | null>;

/**
 * Resolvers walk the tenancy chain queue -> project -> organization so
 * every resource route can be org-scoped without hand-rolled lookups.
 */
export const orgFrom = {
  /** org id passed directly in params/body/query under `key`. */
  param: (key: string = 'organizationId'): OrgResolver =>
    async (req) => {
      const id = req.params?.[key] ?? req.body?.[key] ?? req.query?.[key];
      return id ? { organizationId: String(id) } : null;
    },

  /** project id -> project.organizationId */
  viaProject: (key: string = 'projectId'): OrgResolver =>
    async (req) => {
      const id = req.params?.[key] ?? req.body?.[key] ?? req.query?.[key];
      if (!id) return null;
      const p = await prisma.project.findUnique({
        where: { id: String(id) },
        select: { id: true, organizationId: true },
      });
      return p ? { organizationId: p.organizationId, projectId: p.id } : null;
    },

  /** queue id -> queue.project.organizationId */
  viaQueue: (key: string = 'queueId'): OrgResolver =>
    async (req) => {
      const id = req.params?.[key] ?? req.body?.[key] ?? req.query?.[key];
      if (!id) return null;
      const q = await prisma.queue.findUnique({
        where: { id: String(id) },
        select: { id: true, project: { select: { id: true, organizationId: true } } },
      });
      return q
        ? { organizationId: q.project.organizationId, projectId: q.project.id }
        : null;
    },

  /** :id param -> resolve the named model back to its org. */
  viaResource: (
    model: 'job' | 'queue' | 'project' | 'scheduledJob' | 'apiKey' | 'retryPolicy' | 'organization',
    param: string = 'id'
  ): OrgResolver =>
    async (req) => {
      const id = req.params?.[param];
      if (!id) return null;
      switch (model) {
        case 'organization':
          return { organizationId: String(id) };
        case 'project': {
          const p = await prisma.project.findUnique({
            where: { id: String(id) },
            select: { id: true, organizationId: true },
          });
          return p ? { organizationId: p.organizationId, projectId: p.id } : null;
        }
        case 'queue': {
          const q = await prisma.queue.findUnique({
            where: { id: String(id) },
            select: { id: true, project: { select: { id: true, organizationId: true } } },
          });
          return q
            ? { organizationId: q.project.organizationId, projectId: q.project.id }
            : null;
        }
        case 'job': {
          const j = await prisma.job.findUnique({
            where: { id: String(id) },
            select: { queue: { select: { project: { select: { id: true, organizationId: true } } } } },
          });
          return j
            ? { organizationId: j.queue.project.organizationId, projectId: j.queue.project.id }
            : null;
        }
        case 'scheduledJob': {
          const s = await prisma.scheduledJob.findUnique({
            where: { id: String(id) },
            select: { project: { select: { id: true, organizationId: true } } },
          });
          return s
            ? { organizationId: s.project.organizationId, projectId: s.project.id }
            : null;
        }
        case 'apiKey': {
          const k = await prisma.apiKey.findUnique({
            where: { id: String(id) },
            select: { project: { select: { id: true, organizationId: true } } },
          });
          return k
            ? { organizationId: k.project.organizationId, projectId: k.project.id }
            : null;
        }
        case 'retryPolicy': {
          const rp = await prisma.retryPolicy.findUnique({
            where: { id: String(id) },
            select: { organizationId: true },
          });
          // Org-less policies are global templates: any authenticated user may read.
          if (rp && rp.organizationId === null) return null;
          return rp ? { organizationId: rp.organizationId! } : null;
        }
      }
    },
};

const WRITE_ROLES: Role[] = [Role.ORG_ADMIN, Role.PROJECT_ADMIN, Role.DEVELOPER];

/**
 * Org-scope guard:
 *  - JWT users must hold an OrganizationMember row for the resolved org
 *    (and a write-capable role when `write` is set).
 *  - API-key callers must match the resolved resource's project.
 * A resolver returning null means the target resource was not found (404)
 * or no org context exists in the request (400).
 */
export const orgScope = (resolver: OrgResolver | OrgResolver[], opts: { write?: boolean } = {}) => {
  const resolvers = Array.isArray(resolver) ? resolver : [resolver];
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Resolve every bound resource. All non-null results must agree on one
      // organization — prevents e.g. scheduling into a foreign queue under
      // the caller's own projectId.
      let resolved: ScopeResolution | null = null;
      for (const r of resolvers) {
        const s = await r(req);
        if (!s) continue;
        if (resolved && resolved.organizationId !== s.organizationId) {
          return next(new AppError('Referenced resources belong to different organizations', 403, 'FORBIDDEN'));
        }
        if (!resolved) resolved = s;
      }
      if (!resolved) {
        // Distinguish "no key supplied" from "resource missing": if the id was
        // present in the request, the resource didn't resolve -> 404.
        return next(new AppError('Resource not found or missing organization context', 404, 'NOT_FOUND'));
      }

      if (req.apiKey) {
        if (resolved.projectId && resolved.projectId !== req.apiKey.projectId) {
          return next(new AppError('API key is not authorized for this project', 403, 'FORBIDDEN'));
        }
        // Org-level resources for a project-scoped key: resolve the key's org.
        if (!resolved.projectId) {
          const keyProject = await prisma.project.findUnique({
            where: { id: req.apiKey.projectId },
            select: { organizationId: true },
          });
          if (keyProject?.organizationId !== resolved.organizationId) {
            return next(new AppError('API key is not authorized for this organization', 403, 'FORBIDDEN'));
          }
        }
        req.organizationId = resolved.organizationId;
        return next();
      }

      if (!req.user) {
        return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
      }

      const member = await prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId: resolved.organizationId,
          },
        },
        select: { role: true, organizationId: true },
      });

      if (!member) {
        return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
      }
      if (opts.write && !WRITE_ROLES.includes(member.role)) {
        return next(new AppError('Role cannot perform write operations', 403, 'FORBIDDEN'));
      }

      req.orgMembership = { organizationId: member.organizationId, role: member.role };
      req.organizationId = resolved.organizationId;
      next();
    } catch (err) {
      next(err);
    }
  };
};

/** Role check against the resolved org membership (used after orgScope). */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }
    const role = req.orgMembership?.role ?? req.user.role;
    if (!role || !roles.includes(role)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };
};

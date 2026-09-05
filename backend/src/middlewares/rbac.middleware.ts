import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    }

    if (!req.user.role || !roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }

    next();
  };
};

export const requireOrganizationMembership = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
  }

  // Usually the org ID is passed in params, query, or body
  const targetOrgId = req.params.organizationId || req.body.organizationId || req.query.organizationId;
  
  if (!targetOrgId) {
    // If route doesn't specify org, skip check or enforce it depending on design.
    // For safety, we fail if a specific org context is expected but missing.
    return next(new AppError('Organization ID required', 400, 'BAD_REQUEST'));
  }

  if (req.user.organizationId !== targetOrgId) {
    // Note: If users can belong to multiple orgs, you'd check a DB record here instead.
    // Since our payload has one organizationId for simplicity (or current active org),
    // we use that.
    return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
  }

  next();
};

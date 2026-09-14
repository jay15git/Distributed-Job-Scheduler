import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { tokenUtils } from '../utils/tokens';
import { prisma } from '../database/db';
import { ApiKeyService } from '../services/apikey.service';
import { ApiKeyRepository } from '../repositories/apikey.repository';

const apiKeyService = new ApiKeyService(new ApiKeyRepository(prisma));

declare global {
// eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        organizationId?: string;
        role?: string;
        sessionId: string;
      };
    }
  }
}

/**
 * Dual authentication: a request may authenticate with either a Bearer JWT
 * (user session) or an X-API-Key header (project-scoped service key).
 * API-key requests populate req.apiKey instead of req.user; downstream
 * orgScope/scope guards enforce project boundaries for key callers.
 */
export const requireAuthentication = async (req: Request, res: Response, next: NextFunction) => {
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    try {
      const apiKey = await apiKeyService.validateApiKey(
        apiKeyHeader,
        req.ip,
        req.headers['user-agent']
      );
      req.apiKey = { id: apiKey.id, projectId: apiKey.projectId, scopes: apiKey.scopes };
      return next();
    } catch (err: any) {
      return next(new AppError(err.message || 'Invalid API key', 401, 'UNAUTHORIZED'));
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token is required', 401, 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = tokenUtils.verifyAccessToken(token);

    // Validate the session exists and is not revoked
    const sessionTokenHash = tokenUtils.hashToken(payload.sessionId);
    const session = await prisma.userSession.findUnique({
      where: { tokenHash: sessionTokenHash },
    });

    if (!session || session.revokedAt) {
      return next(new AppError('Session expired or revoked', 401, 'UNAUTHORIZED'));
    }

    // Check token version to ensure token wasn't issued before a password change/lockout
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tokenVersion: true, lockedUntil: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      return next(new AppError('User not found or disabled', 401, 'UNAUTHORIZED'));
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return next(new AppError('Account is currently locked', 401, 'ACCOUNT_LOCKED'));
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      return next(new AppError('Token invalidated', 401, 'UNAUTHORIZED'));
    }

    // Update last activity asynchronously
    prisma.userSession.update({
      where: { id: session.id },
      data: { lastActivity: new Date() },
    }).catch((err) => console.error('Failed to update session activity:', err));

    req.user = {
      id: payload.userId,
      organizationId: payload.organizationId,
      role: payload.role,
      sessionId: payload.sessionId,
    };

    next();
  } catch {
    return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
};

/**
 * JWT-only guard: rejects API-key callers. Used on routes that manage
 * credentials (API keys themselves) or need a human identity (createdBy).
 */
export const requireUser = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('User authentication required (API keys cannot manage credentials)', 403, 'FORBIDDEN'));
  }
  next();
};

/**
 * Scope guard for API-key callers. JWT-authenticated users pass through —
 * their authorization is handled by orgScope/role checks downstream.
 */
export const requireScope = (...scopes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) return next();
    if (!scopes.every(s => req.apiKey!.scopes.includes(s))) {
      return next(new AppError('API key lacks required scope', 403, 'FORBIDDEN'));
    }
    next();
  };
};

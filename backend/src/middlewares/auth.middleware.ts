import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { tokenUtils } from '../utils/tokens';
import { prisma } from '../database/db';

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

export const requireAuthentication = async (req: Request, res: Response, next: NextFunction) => {
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

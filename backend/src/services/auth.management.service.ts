import { AuthService as BaseAuthService } from './auth.service';
import { prisma, runInTransaction } from '../database/db';
import { AppError } from '../errors';
import { tokenUtils } from '../utils/tokens';
import { authConfig } from '../config/auth';
import bcrypt from 'bcrypt';

export class AuthManagementService extends BaseAuthService {
  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const rawToken = tokenUtils.generateRandomToken();
    const tokenHash = tokenUtils.hashToken(rawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + authConfig.password.resetTokenExpiresIn),
      },
    });

    // Send email with rawToken...
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  static async resetPassword(data: any) {
    const tokenHash = tokenUtils.hashToken(data.token);

    return runInTransaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });

      if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
        throw new AppError('Invalid or expired reset token', 400, 'BAD_REQUEST');
      }

      const passwordHash = await bcrypt.hash(data.newPassword, authConfig.password.saltRounds);

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { 
          passwordHash,
          tokenVersion: resetToken.user.tokenVersion + 1, // Invalidates all existing JWTs
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      // Revoke all sessions and refresh tokens
      await tx.userSession.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
      });

      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, isRevoked: false },
        data: { isRevoked: true },
      });

      await tx.auditLog.create({
        data: { userId: resetToken.userId, action: 'PASSWORD_RESET', resourceType: 'User', resourceId: resetToken.userId },
      });

      return { message: 'Password has been reset successfully. Please log in again.' };
    });
  }

  static async changePassword(userId: string, data: any) {
    return runInTransaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

      const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!isValid) throw new AppError('Invalid current password', 400, 'BAD_REQUEST');

      const passwordHash = await bcrypt.hash(data.newPassword, authConfig.password.saltRounds);

      await tx.user.update({
        where: { id: userId },
        data: { 
          passwordHash,
          tokenVersion: user.tokenVersion + 1,
        },
      });

      await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGED' },
      });

      await tx.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });

      await tx.auditLog.create({
        data: { userId, action: 'PASSWORD_CHANGE', resourceType: 'User', resourceId: userId },
      });

      return { message: 'Password changed successfully. Please log in again.' };
    });
  }

  static async getSessions(userId: string) {
    return prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActivity: 'desc' },
      select: {
        id: true,
        deviceName: true,
        browser: true,
        os: true,
        ipAddress: true,
        lastIpAddress: true,
        userAgent: true,
        location: true,
        createdAt: true,
        lastActivity: true,
      },
    });
  }

  static async revokeSession(userId: string, sessionId: string) {
    const session = await prisma.userSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });

    if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');

    await runInTransaction(async (tx) => {
      await tx.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokedReason: 'USER_REVOKED' },
      });

      if (session.refreshTokenHash) {
        await tx.refreshToken.updateMany({
          where: { tokenHash: session.refreshTokenHash },
          data: { isRevoked: true },
        });
      }

      await tx.auditLog.create({
        data: { userId, action: 'SESSION_REVOKED', resourceType: 'UserSession', resourceId: sessionId },
      });
    });

    return { message: 'Session revoked' };
  }
}

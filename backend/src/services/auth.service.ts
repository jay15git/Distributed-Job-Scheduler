import bcrypt from 'bcrypt';
import { prisma, runInTransaction } from '../database/db';
import { AppError } from '../errors';
import { tokenUtils } from '../utils/tokens';
import { authConfig } from '../config/auth';
import { env } from '../config/env';

export class AuthService {
  static async register(data: any) {
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      throw new AppError('User already exists', 400, 'BAD_REQUEST');
    }

    const passwordHash = await bcrypt.hash(data.password, authConfig.password.saltRounds);

    return runInTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          name: data.name,
          isVerified: false,
        },
      });

      const rawToken = tokenUtils.generateRandomToken();
      const tokenHash = tokenUtils.hashToken(rawToken);

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + authConfig.emailVerification.expiresIn),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'REGISTER',
          resourceType: 'User',
          resourceId: user.id,
          details: { email: user.email },
        },
      });

      // No SMTP configured: EMAIL_MODE=dev returns the token in the response
      // (and logs it) so the verify flow is exercisable; 'none' suppresses it.
      const response: Record<string, string> = {
        message: 'Registration successful. Please check your email to verify your account.',
      };
      if (env.EMAIL_MODE === 'dev') {
        response.devVerificationToken = rawToken;
      }

      return response;
    });
  }

  static async verifyEmail(token: string) {
    const tokenHash = tokenUtils.hashToken(token);
    return runInTransaction(async (tx) => {
      const verification = await tx.emailVerificationToken.findUnique({ where: { tokenHash } });

      if (!verification || verification.usedAt || verification.expiresAt < new Date()) {
        throw new AppError('Invalid or expired verification token', 400, 'BAD_REQUEST');
      }

      await tx.user.update({
        where: { id: verification.userId },
        data: { isVerified: true },
      });

      await tx.emailVerificationToken.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: verification.userId,
          action: 'EMAIL_VERIFIED',
          resourceType: 'User',
          resourceId: verification.userId,
        },
      });

      return { message: 'Email verified successfully' };
    });
  }

  static async login(data: any, meta: { ipAddress?: string; userAgent?: string; deviceName?: string }) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user) {
      await this.logAttempt(null, data.email, meta, false, 'USER_NOT_FOUND');
      throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.logAttempt(user.id, data.email, meta, false, 'ACCOUNT_LOCKED');
      throw new AppError('Account locked', 403, 'FORBIDDEN');
    }

    const isValid = await bcrypt.compare(data.password, user.passwordHash);

    if (!isValid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= authConfig.lockout.maxAttempts ? new Date(Date.now() + authConfig.lockout.durationMs) : null;

      await runInTransaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: attempts, lockedUntil },
        });
        await this.logAttempt(user.id, data.email, meta, false, 'INVALID_PASSWORD', tx);

        if (lockedUntil) {
          await tx.auditLog.create({
            data: { userId: user.id, action: 'ACCOUNT_LOCKOUT', resourceType: 'User', resourceId: user.id, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
          });
        }
      });

      throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
    }

    if (!user.isVerified) {
      await this.logAttempt(user.id, data.email, meta, false, 'EMAIL_NOT_VERIFIED');
      throw new AppError('Email not verified', 403, 'FORBIDDEN');
    }

    return runInTransaction(async (tx) => {
      // Reset lock
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });

      const rawSessionId = tokenUtils.generateRandomToken();
      const rawRefreshToken = tokenUtils.generateRandomToken();
      const familyId = tokenUtils.generateRandomToken();

      const accessToken = tokenUtils.generateAccessToken({
        userId: user.id,
        sessionId: rawSessionId,
        tokenVersion: user.tokenVersion,
      });

      await tx.userSession.create({
        data: {
          userId: user.id,
          tokenHash: tokenUtils.hashToken(rawSessionId),
          refreshTokenHash: tokenUtils.hashToken(rawRefreshToken),
          deviceName: meta.deviceName,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          lastIpAddress: meta.ipAddress,
          lastUserAgent: meta.userAgent,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
        },
      });

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: tokenUtils.hashToken(rawRefreshToken),
          familyId,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
      });

      await this.logAttempt(user.id, data.email, meta, true, null, tx);

      await tx.auditLog.create({
        data: { userId: user.id, action: 'LOGIN', resourceType: 'User', resourceId: user.id, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
      });

      return { accessToken, refreshToken: rawRefreshToken };
    });
  }

  static async refresh(refreshToken: string, meta: { ipAddress?: string; userAgent?: string; deviceName?: string }) {
    const tokenHash = tokenUtils.hashToken(refreshToken);

    return runInTransaction(async (tx) => {
      const storedToken = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!storedToken) {
        throw new AppError('Invalid token', 401, 'UNAUTHORIZED');
      }

      if (storedToken.isRevoked || storedToken.expiresAt < new Date()) {
        // Family compromise detected
        await tx.refreshToken.updateMany({
          where: { familyId: storedToken.familyId },
          data: { isRevoked: true },
        });

        // Also revoke the session associated with this token hash
        await tx.userSession.updateMany({
          where: { refreshTokenHash: storedToken.tokenHash, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'TOKEN_FAMILY_COMPROMISED' },
        });

        await tx.auditLog.create({
          data: { userId: storedToken.userId, action: 'TOKEN_FAMILY_REVOKED', resourceType: 'User', resourceId: storedToken.userId, details: { reason: 'Reused revoked token' }, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
        });

        throw new AppError('Compromised token', 401, 'UNAUTHORIZED');
      }

      if (storedToken.user.lockedUntil && storedToken.user.lockedUntil > new Date()) {
        throw new AppError('Account locked', 403, 'FORBIDDEN');
      }

      const rawSessionId = tokenUtils.generateRandomToken();
      const newRawRefreshToken = tokenUtils.generateRandomToken();
      const newHash = tokenUtils.hashToken(newRawRefreshToken);

      const accessToken = tokenUtils.generateAccessToken({
        userId: storedToken.userId,
        sessionId: rawSessionId,
        tokenVersion: storedToken.user.tokenVersion,
      });

      // Revoke the old token
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { isRevoked: true, replacedByTokenHash: newHash },
      });

      await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: newHash,
          familyId: storedToken.familyId,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
      });

      // Find old session and carry it over or create new one
      const oldSession = await tx.userSession.findFirst({
        where: { refreshTokenHash: tokenHash, revokedAt: null },
      });

      if (oldSession) {
        await tx.userSession.update({
          where: { id: oldSession.id },
          data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
        });
      }

      await tx.userSession.create({
        data: {
          userId: storedToken.userId,
          tokenHash: tokenUtils.hashToken(rawSessionId),
          refreshTokenHash: newHash,
          deviceName: meta.deviceName || oldSession?.deviceName,
          ipAddress: oldSession?.ipAddress,
          userAgent: oldSession?.userAgent,
          lastIpAddress: meta.ipAddress,
          lastUserAgent: meta.userAgent,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
      });

      await tx.auditLog.create({
        data: { userId: storedToken.userId, action: 'TOKEN_REFRESHED', resourceType: 'User', resourceId: storedToken.userId, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
      });

      return { accessToken, refreshToken: newRawRefreshToken };
    });
  }

  static async logout(sessionId: string) {
    const sessionTokenHash = tokenUtils.hashToken(sessionId);

    return runInTransaction(async (tx) => {
      const session = await tx.userSession.findUnique({ where: { tokenHash: sessionTokenHash } });
      if (session && !session.revokedAt) {
        await tx.userSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
        });

        if (session.refreshTokenHash) {
          await tx.refreshToken.updateMany({
            where: { tokenHash: session.refreshTokenHash },
            data: { isRevoked: true },
          });
        }

        await tx.auditLog.create({
          data: { userId: session.userId, action: 'LOGOUT', resourceType: 'UserSession', resourceId: session.id },
        });
      }
    });
  }

  private static async logAttempt(userId: string | null, email: string, meta: any, success: boolean, failureReason: string | null, tx: any = prisma) {
    await tx.loginAttempt.create({
      data: {
        userId,
        email,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        success,
        failureReason,
      },
    });
  }
}

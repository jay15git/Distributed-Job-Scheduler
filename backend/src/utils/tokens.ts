import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth';

export interface JwtPayload {
  userId: string;
  organizationId?: string;
  role?: string;
  sessionId: string;
  tokenVersion: number;
}

export const tokenUtils = {
  generateRandomToken(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
  },

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  },

  generateAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload as any, authConfig.jwt.secret, {
      expiresIn: authConfig.jwt.accessExpiresIn as any,
      issuer: authConfig.jwt.issuer,
    });
  },

  verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, authConfig.jwt.secret, {
      issuer: authConfig.jwt.issuer,
    }) as JwtPayload;
  },
};

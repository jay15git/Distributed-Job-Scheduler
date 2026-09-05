import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthManagementService } from '../services/auth.management.service';

export class AuthController {
  static async register(req: Request, res: Response) {
    const result = await AuthService.register(req.body);
    res.status(201).json({ status: 'success', data: result });
  }

  static async login(req: Request, res: Response) {
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceName: req.body.deviceName,
    };
    const result = await AuthService.login(req.body, meta);
    res.status(200).json({ status: 'success', data: result });
  }

  static async refresh(req: Request, res: Response) {
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceName: req.body.deviceName,
    };
    const result = await AuthService.refresh(req.body.refreshToken, meta);
    res.status(200).json({ status: 'success', data: result });
  }

  static async logout(req: Request, res: Response) {
    if (req.user?.sessionId) {
      await AuthService.logout(req.user.sessionId);
    }
    res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  }

  static async verifyEmail(req: Request, res: Response) {
    const result = await AuthService.verifyEmail(req.body.token);
    res.status(200).json({ status: 'success', data: result });
  }

  static async forgotPassword(req: Request, res: Response) {
    const result = await AuthManagementService.forgotPassword(req.body.email);
    res.status(200).json({ status: 'success', data: result });
  }

  static async resetPassword(req: Request, res: Response) {
    const result = await AuthManagementService.resetPassword(req.body);
    res.status(200).json({ status: 'success', data: result });
  }

  static async changePassword(req: Request, res: Response) {
    if (!req.user) throw new Error('Unauthorized');
    const result = await AuthManagementService.changePassword(req.user.id, req.body);
    res.status(200).json({ status: 'success', data: result });
  }

  static async getMe(req: Request, res: Response) {
    // Usually fetches user profile. For now returning injected token user.
    res.status(200).json({ status: 'success', data: { user: req.user } });
  }

  static async getSessions(req: Request, res: Response) {
    if (!req.user) throw new Error('Unauthorized');
    const result = await AuthManagementService.getSessions(req.user.id);
    res.status(200).json({ status: 'success', data: result });
  }

  static async revokeSession(req: Request, res: Response) {
    if (!req.user) throw new Error('Unauthorized');
    const result = await AuthManagementService.revokeSession(req.user.id, req.params.id);
    res.status(200).json({ status: 'success', data: result });
  }
}

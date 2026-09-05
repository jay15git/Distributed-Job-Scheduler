import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';
import { requireAuthentication } from '../middlewares/auth.middleware';
import { 
  loginRateLimiter, 
  passwordResetRateLimiter, 
  refreshRateLimiter, 
  verifyEmailRateLimiter 
} from '../middlewares/rateLimiter';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema
} from '../validators/auth.validator';

const router = Router();

// Public routes
router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login', loginRateLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', refreshRateLimiter, validate(refreshSchema), AuthController.refresh);
router.post('/forgot-password', passwordResetRateLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', passwordResetRateLimiter, validate(resetPasswordSchema), AuthController.resetPassword);
router.post('/verify-email', verifyEmailRateLimiter, validate(verifyEmailSchema), AuthController.verifyEmail);

// Protected routes
router.use(requireAuthentication);

router.post('/logout', AuthController.logout);
router.post('/change-password', validate(changePasswordSchema), AuthController.changePassword);
router.get('/me', AuthController.getMe);
router.get('/sessions', AuthController.getSessions);
router.delete('/sessions/:id', AuthController.revokeSession);

export { router as authRoutes };

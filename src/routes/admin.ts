import { Router, Request, Response, NextFunction } from 'express';
import { authController } from '../controllers/authController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AppError, ValidationError } from '../types';
import { validationService } from '../services/ValidationService';

const router = Router();

/**
 * POST /api/admin/login
 * Consultant login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Validate credentials
    const validation = validationService.validateLoginCredentials({ email, password });

    if (!validation.valid) {
      throw new ValidationError('Invalid credentials', validation.errors);
    }

    // Login
    const result = await authController.login(email, password);

    res.json({
      success: true,
      token: result.token,
      consultor: result.consultor,
      expiresIn: 86400,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/logout
 * Logout (mainly for frontend to clear token)
 */
router.post('/logout', authenticateToken, async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/admin/profile
 * Get current consultant profile
 */
router.get(
  '/profile',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;

      if (!consultorId) {
        throw new AppError('Consultant ID not found in token', 401);
      }

      const profile = await authController.getProfile(consultorId);

      res.json({
        success: true,
        data: profile,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/admin/profile
 * Update consultant profile
 */
router.patch(
  '/profile',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;

      if (!consultorId) {
        throw new AppError('Consultant ID not found in token', 401);
      }

      const { nombre, apellido, especialidad } = req.body;

      const updated = await authController.updateProfile(consultorId, {
        nombre,
        apellido,
        especialidad,
      });

      res.json({
        success: true,
        data: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/change-password
 * Change consultant password
 */
router.post(
  '/change-password',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;

      if (!consultorId) {
        throw new AppError('Consultant ID not found in token', 401);
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword) {
        throw new ValidationError('Current password and new password are required', {
          currentPassword: !currentPassword ? 'Required' : '',
          newPassword: !newPassword ? 'Required' : '',
        });
      }

      if (newPassword !== confirmPassword) {
        throw new ValidationError('Passwords do not match', {
          confirmPassword: 'Passwords do not match',
        });
      }

      if (newPassword.length < 6) {
        throw new ValidationError('New password must be at least 6 characters', {
          newPassword: 'Minimum 6 characters',
        });
      }

      await authController.changePassword(consultorId, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/consultants
 * List all consultants (admin only)
 */
router.get(
  '/consultants',
  authenticateToken,
  requireRole('super_admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pool = await (await import('../config/database')).getDatabase();

      const [rows] = await pool.execute(
        `SELECT id, nombre, apellido, email, especialidad, activo, created_at
         FROM CONSULTORES
         ORDER BY created_at DESC`
      );

      res.json({
        success: true,
        data: rows,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { authController } from '../controllers/authController';
import { leadApprovalController } from '../controllers/leadApprovalController';
import { authenticateToken } from '../middleware/auth';
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
 * GET /api/admin/leads-espera
 * List leads in waiting list by status
 * Query: ?estado=pendiente&limit=50
 */
router.get(
  '/leads-espera',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const estado = (req.query.estado as string) || 'pendiente';
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const leads = await leadApprovalController.listWaitingLeads(estado, limit);
      const leadArray = Array.isArray(leads) ? leads : [];

      res.json({
        success: true,
        data: leadArray,
        count: leadArray.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/admin/leads-espera/:leadId/aprobar
 * Approve a lead from waiting list
 */
router.patch(
  '/leads-espera/:leadId/aprobar',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;
      const { consultorId } = req.body;

      const result = await leadApprovalController.approveLead({
        leadId,
        consultorId,
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/admin/leads-espera/:leadId/rechazar
 * Reject a lead from waiting list
 */
router.patch(
  '/leads-espera/:leadId/rechazar',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;
      const { motivo } = req.body;

      const result = await leadApprovalController.rejectLead({
        leadId,
        motivo,
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/leads-espera/:leadId/enviar-zoom
 * Send Zoom link to approved lead
 */
router.post(
  '/leads-espera/:leadId/enviar-zoom',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;
      const { zoomLink } = req.body;

      if (!zoomLink) {
        throw new ValidationError('Zoom link is required', {
          zoomLink: 'Zoom link is required',
        });
      }

      const result = await leadApprovalController.sendZoomLink({
        leadId,
        zoomLink,
      });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/leads-espera/:leadId/convertir-cliente
 * Convert approved lead to client (for scheduling appointments)
 */
router.post(
  '/leads-espera/:leadId/convertir-cliente',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;

      const result = await leadApprovalController.convertApprovedLeadToClient(leadId);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

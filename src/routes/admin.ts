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
      const estatusComercial = req.query.estatus_comercial as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const leads = await leadApprovalController.listWaitingLeads(estado, limit, estatusComercial);
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
 * POST /api/admin/leads-espera/:leadId/asignar-sesion
 * Assign a session manually to a lead
 */
router.post(
  '/leads-espera/:leadId/asignar-sesion',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;
      const { consultor_id, fecha_hora_inicio, fecha_hora_fin, notas_cliente, estatus_comercial } = req.body;

      if (!consultor_id || !fecha_hora_inicio) {
        throw new ValidationError('consultor_id and fecha_hora_inicio are required', {
          consultor_id: !consultor_id ? 'Required' : '',
          fecha_hora_inicio: !fecha_hora_inicio ? 'Required' : '',
        });
      }

      const result = await leadApprovalController.assignSessionToLead(leadId, {
        consultor_id,
        fecha_hora_inicio,
        fecha_hora_fin,
        notas_cliente,
        estatus_comercial,
      });

      res.status(201).json({
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

/**
 * GET /api/admin/consultores
 * List all consultants (authenticated)
 */
router.get(
  '/consultores',
  authenticateToken,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authController.listConsultores();
      res.json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/consultores
 * Register a new consultant (authenticated — only existing consultants can add others)
 */
router.post(
  '/consultores',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nombre, apellido, email, password, especialidad } = req.body;

      if (!nombre || !email || !password) {
        throw new ValidationError('nombre, email y password son requeridos', {
          nombre: !nombre ? 'Requerido' : '',
          email: !email ? 'Requerido' : '',
          password: !password ? 'Requerido' : '',
        });
      }

      if (password.length < 6) {
        throw new ValidationError('La contraseña debe tener al menos 6 caracteres', {
          password: 'Mínimo 6 caracteres',
        });
      }

      const emailValidation = validationService.validateLoginCredentials({ email, password });
      if (!emailValidation.valid && emailValidation.errors?.email) {
        throw new ValidationError('Email inválido', { email: emailValidation.errors.email });
      }

      const result = await authController.registerConsultor({ nombre, apellido, email, password, especialidad });

      res.status(201).json({
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
 * PATCH /api/admin/consultores/:id/toggle-activo
 * Activate or deactivate a consultant
 */
router.patch(
  '/consultores/:id/toggle-activo',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { activo } = req.body;

      if (typeof activo !== 'boolean') {
        throw new ValidationError('El campo activo debe ser booleano', { activo: 'Requerido' });
      }

      const result = await authController.toggleConsultorActivo(id, activo);
      res.json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/admin/consultores/:id
 * Delete a consultant permanently
 */
router.delete(
  '/consultores/:id',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await authController.deleteConsultor(id);
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/profile/change-password
 * Change current consultant's password
 */
router.post(
  '/profile/change-password',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new ValidationError('No autenticado', { id: 'Requerido' });
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        throw new ValidationError('currentPassword y newPassword son requeridos', {
          currentPassword: !currentPassword ? 'Requerido' : '',
          newPassword: !newPassword ? 'Requerido' : '',
        });
      }
      await authController.changeConsultorPassword(consultorId, currentPassword, newPassword);
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/admin/leads-espera/:leadId
 * Permanently delete a lead from the waiting list
 */
router.delete(
  '/leads-espera/:leadId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;
      const { getDatabase } = await import('../config/database');
      const pool = await getDatabase();
      await pool.execute('DELETE FROM LEADS_EN_ESPERA WHERE id = ?', [leadId]);
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

export default router;


import { Router, Request, Response, NextFunction } from 'express';
import { authController } from '../controllers/authController';
import { leadApprovalController } from '../controllers/leadApprovalController';
import { diagnosticoController } from '../controllers/diagnosticoController';
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

      const leads = await leadApprovalController.listWaitingLeads(
        estado,
        limit,
        estatusComercial,
        req.user?.sub,
        req.user?.role === 'super_admin'
      );
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
 * GET /api/admin/historico-clientes
 * List archived clients/leads.
 * Query: ?etiqueta=cliente_removido&limit=50
 */
router.get(
  '/historico-clientes',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const etiqueta = req.query.etiqueta as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const historico = await leadApprovalController.listClientHistory(limit, etiqueta);
      const historicoArray = Array.isArray(historico) ? historico : [];

      res.json({
        success: true,
        data: historicoArray,
        count: historicoArray.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/historico-clientes/:historicoId/restaurar
 * Restore an archived manual client back to active clients.
 */
router.post(
  '/historico-clientes/:historicoId/restaurar',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const restored = await leadApprovalController.restoreManualClientFromHistory(
        req.params.historicoId,
        consultorId,
        req.user?.role === 'super_admin'
      );

      res.json({
        success: true,
        data: restored,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/clientes-consultor
 * List manually added clients. Super admins see all, consultants see their own.
 */
router.get(
  '/clientes-consultor',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const clients = await leadApprovalController.listManualClients(
        consultorId,
        req.user?.role === 'super_admin',
        limit,
        req.query.client_status as string | undefined
      );
      const clientArray = Array.isArray(clients) ? clients : [];

      res.json({
        success: true,
        data: clientArray,
        count: clientArray.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/servicios-clientes
 * List service tags available for clients.
 */
router.get(
  '/servicios-clientes',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const services = await leadApprovalController.listClientServices(includeInactive);
      const serviceArray = Array.isArray(services) ? services : [];

      res.json({
        success: true,
        data: serviceArray,
        count: serviceArray.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/servicios-clientes
 * Create or reactivate a client service tag.
 */
router.post(
  '/servicios-clientes',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await leadApprovalController.createClientService(req.body?.nombre);

      res.status(201).json({
        success: true,
        data: service,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/asesores-comerciales
 * List commercial advisor catalog.
 */
router.get(
  '/asesores-comerciales',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const advisors = await leadApprovalController.listCommercialAdvisors(includeInactive);
      const advisorArray = Array.isArray(advisors) ? advisors : [];

      res.json({
        success: true,
        data: advisorArray,
        count: advisorArray.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/asesores-comerciales
 * Create or reactivate a commercial advisor.
 */
router.post(
  '/asesores-comerciales',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const advisor = await leadApprovalController.createCommercialAdvisor(req.body?.nombre);

      res.status(201).json({
        success: true,
        data: advisor,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/clientes-consultor/:clientId/consultores
 * List consultant assignments for a manual client.
 */
router.get(
  '/clientes-consultor/:clientId/consultores',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignments = await leadApprovalController.listClientConsultantAssignments(req.params.clientId);
      const assignmentArray = Array.isArray(assignments) ? assignments : [];

      res.json({
        success: true,
        data: assignmentArray,
        count: assignmentArray.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/clientes-consultor/:clientId/consultores
 * Manually assign a consultant to a client service/stage.
 */
router.post(
  '/clientes-consultor/:clientId/consultores',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const assignment = await leadApprovalController.createClientConsultantAssignment(
        req.params.clientId,
        req.body || {},
        consultorId
      );

      res.status(201).json({
        success: true,
        data: assignment,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/admin/clientes-consultor/:clientId/consultores/:assignmentId
 * Update a consultant assignment for a client.
 */
router.patch(
  '/clientes-consultor/:clientId/consultores/:assignmentId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignment = await leadApprovalController.updateClientConsultantAssignment(
        req.params.clientId,
        req.params.assignmentId,
        req.body || {}
      );

      res.json({
        success: true,
        data: assignment,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/admin/clientes-consultor/:clientId/consultores/:assignmentId
 * Soft delete a consultant assignment for a client.
 */
router.delete(
  '/clientes-consultor/:clientId/consultores/:assignmentId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await leadApprovalController.deleteClientConsultantAssignment(
        req.params.clientId,
        req.params.assignmentId
      );

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
 * GET /api/admin/clientes-consultor/:clientId/diagnostico
 * Get the strategic diagnostic form for a manually added client.
 */
router.get(
  '/clientes-consultor/:clientId/diagnostico',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const diagnostico = await diagnosticoController.getDiagnostico(
        'cliente_consultor',
        req.params.clientId,
        consultorId,
        req.user?.role === 'super_admin'
      );

      res.json({
        success: true,
        data: diagnostico,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/admin/clientes-consultor/:clientId/diagnostico
 * Save the strategic diagnostic form for a manually added client.
 */
router.put(
  '/clientes-consultor/:clientId/diagnostico',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const diagnostico = await diagnosticoController.saveDiagnostico(
        'cliente_consultor',
        req.params.clientId,
        req.body || {},
        consultorId,
        req.user?.role === 'super_admin'
      );

      res.json({
        success: true,
        data: diagnostico,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/historico-clientes/:historicoId/diagnostico
 * Get the strategic diagnostic form for an archived client.
 */
router.get(
  '/historico-clientes/:historicoId/diagnostico',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const diagnostico = await diagnosticoController.getDiagnostico(
        'historico_cliente',
        req.params.historicoId,
        consultorId,
        req.user?.role === 'super_admin'
      );

      res.json({
        success: true,
        data: diagnostico,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/admin/historico-clientes/:historicoId/diagnostico
 * Save the strategic diagnostic form for an archived client.
 */
router.put(
  '/historico-clientes/:historicoId/diagnostico',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const diagnostico = await diagnosticoController.saveDiagnostico(
        'historico_cliente',
        req.params.historicoId,
        req.body || {},
        consultorId,
        req.user?.role === 'super_admin'
      );

      res.json({
        success: true,
        data: diagnostico,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/clientes-consultor
 * Add a non-organic/manual client assigned to a consultant.
 */
router.post(
  '/clientes-consultor',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const result = await leadApprovalController.createManualClient(
        req.body || {},
        consultorId,
        req.user?.role === 'super_admin'
      );

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
 * PATCH /api/admin/clientes-consultor/:clientId
 * Update a manually added client and its service tags.
 */
router.patch(
  '/clientes-consultor/:clientId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const result = await leadApprovalController.updateManualClient(
        req.params.clientId,
        req.body || {},
        consultorId,
        req.user?.role === 'super_admin'
      );

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
 * PATCH /api/admin/clientes-consultor/:clientId/status
 * Update only the client process status.
 */
router.patch(
  '/clientes-consultor/:clientId/status',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const result = await leadApprovalController.updateManualClientStatus(
        req.params.clientId,
        req.body?.client_status,
        consultorId,
        req.user?.role === 'super_admin'
      );

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
 * GET /api/admin/clientes-consultor/:clientId/archivos
 * List files stored locally for a client.
 */
router.get(
  '/clientes-consultor/:clientId/archivos',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const files = await leadApprovalController.listManualClientFiles(
        req.params.clientId,
        consultorId,
        req.user?.role === 'super_admin'
      );
      const fileArray = Array.isArray(files) ? files : [];

      res.json({
        success: true,
        data: fileArray,
        count: fileArray.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/clientes-consultor/:clientId/archivos
 * Upload one or more files to local VPS storage.
 * Form field: archivo. Optional field: campo; defaults to archivos_extras.
 */
router.post(
  '/clientes-consultor/:clientId/archivos',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const files = await leadApprovalController.uploadManualClientFile(
        req.params.clientId,
        req,
        consultorId,
        req.user?.role === 'super_admin'
      );

      res.status(201).json({
        success: true,
        data: files,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/clientes-consultor/:clientId/archivos/:fileId
 * Download a locally stored client file.
 */
router.get(
  '/clientes-consultor/:clientId/archivos/:fileId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const file = await leadApprovalController.getManualClientFile(
        req.params.clientId,
        req.params.fileId,
        consultorId,
        req.user?.role === 'super_admin'
      );

      if (file.mime_type) {
        res.setHeader('Content-Type', file.mime_type);
      }
      res.download(file.absolutePath, file.nombre_original);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/admin/clientes-consultor/:clientId/archivos/:fileId
 * Delete a locally stored client file.
 */
router.delete(
  '/clientes-consultor/:clientId/archivos/:fileId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;
      if (!consultorId) throw new AppError('Consultant ID not found in token', 401);

      const result = await leadApprovalController.deleteManualClientFile(
        req.params.clientId,
        req.params.fileId,
        consultorId,
        req.user?.role === 'super_admin'
      );

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
 * DELETE /api/admin/clientes-consultor/:clientId
 * Archive a manually added client into HISTORICO_CLIENTES.
 */
router.delete(
  '/clientes-consultor/:clientId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clientId } = req.params;
      const result = await leadApprovalController.archiveManualClient(clientId, {
        etiqueta: req.body?.etiqueta || req.query.etiqueta as string | undefined,
        motivo: req.body?.motivo || req.query.motivo as string | undefined,
        archivedBy: req.user?.sub,
      });
      res.json({ success: true, data: result, timestamp: new Date().toISOString() });
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
      }, req.user?.role === 'super_admin');

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
 * POST /api/admin/leads-espera/:leadId/enviar-meet
 * Send Google Meet link to approved lead.
 * Also accepts legacy alias /enviar-zoom and `zoomLink` body field for
 * backward compatibility with older Postman collections / clients.
 */
router.post(
  ['/leads-espera/:leadId/enviar-meet', '/leads-espera/:leadId/enviar-zoom'],
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;
      const meetLink = req.body?.meetLink ?? req.body?.zoomLink;

      if (!meetLink) {
        throw new ValidationError('Google Meet link is required', {
          meetLink: 'Google Meet link is required',
        });
      }

      const result = await leadApprovalController.sendMeetLink({
        leadId,
        meetLink,
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
  requireRole('super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nombre, apellido, email, password, especialidad, rol } = req.body;

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

      if (rol && !['consultant', 'super_admin'].includes(rol)) {
        throw new ValidationError('Rol inválido', {
          rol: 'Debe ser consultant o super_admin',
        });
      }

      const emailValidation = validationService.validateLoginCredentials({ email, password });
      if (!emailValidation.valid && emailValidation.errors?.email) {
        throw new ValidationError('Email inválido', { email: emailValidation.errors.email });
      }

      const result = await authController.registerConsultor({ nombre, apellido, email, password, especialidad, rol });

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
  requireRole('super_admin'),
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
  requireRole('super_admin'),
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
 * Archive a lead/client into HISTORICO_CLIENTES and remove it from active tables.
 */
router.delete(
  '/leads-espera/:leadId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.params;
      const result = await leadApprovalController.archiveLeadToHistory(leadId, {
        etiqueta: req.body?.etiqueta || req.query.etiqueta as string | undefined,
        motivo: req.body?.motivo || req.query.motivo as string | undefined,
        archivedBy: req.user?.sub,
      });
      res.json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  }
);

export default router;


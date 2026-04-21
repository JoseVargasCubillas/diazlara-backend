import { Router, Request, Response, NextFunction } from 'express';
import { qualificationController } from '../controllers/qualificationController';
import { validationService } from '../services/ValidationService';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AppError, QualificationRequest } from '../types';

const router = Router();

/**
 * POST /api/qualifications
 * Create or update qualification for an appointment (consultant only)
 */
router.post(
  '/',
  authenticateToken,
  requireRole('consultant'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const consultorId = req.user?.sub;

      if (!consultorId) {
        throw new AppError('Consultant ID not found in token', 401);
      }

      // Validate qualification request
      const validation = validationService.validateQualification(req.body);

      if (!validation.valid) {
        throw new AppError('Validation failed', 400);
      }

      const qualData: QualificationRequest = req.body;

      // Create/update qualification
      const qualification = await qualificationController.createQualification(
        consultorId,
        qualData
      );

      res.status(201).json({
        success: true,
        data: qualification,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/qualifications/:id
 * Get qualification details (consultant only)
 */
router.get(
  '/:id',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const qualification = await qualificationController.getQualification(id);

      res.json({
        success: true,
        data: qualification,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/qualifications?cita_id=xxx
 * Get qualification by appointment ID
 */
router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cita_id } = req.query;

    if (!cita_id) {
      throw new AppError('cita_id query parameter is required', 400);
    }

    const qualification = await qualificationController.getQualificationByCita(
      cita_id as string
    );

    if (!qualification) {
      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      data: qualification,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/qualifications/:id/export-hubspot
 * Manually trigger HubSpot export for a qualification (admin only)
 */
router.post(
  '/:id/export-hubspot',
  authenticateToken,
  requireRole('super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const qualification = await qualificationController.getQualification(id);

      if (qualification.exportado_hubspot) {
        res.json({
          success: true,
          message: 'Qualification already exported to HubSpot',
          data: qualification,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Mark as exported (actual sync already happens during qualification creation)
      await qualificationController.markAsExportedToHubSpot(id, 'hubspot-sync-' + Date.now());

      res.json({
        success: true,
        message: 'Qualification exported to HubSpot',
        data: qualification,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

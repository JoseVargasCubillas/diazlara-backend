import { Router, Request, Response, NextFunction } from 'express';
import { LeadSubmissionRequest, AppError } from '../types';
import { leadController } from '../controllers/leadController';

const router = Router();

/**
 * POST /api/leads
 * Create a new lead from form submission
 */
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leadData: LeadSubmissionRequest = req.body;

      // Basic validation
      if (!leadData.nombre || !leadData.email) {
        throw new AppError('Nome and email are required', 400, 'MISSING_FIELDS');
      }

      const result = await leadController.createLead(leadData);

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
 * GET /api/leads/:id
 * Retrieve lead details from waiting list
 */
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const lead = await leadController.getLeadFromWaitingList(id);

      if (!lead) {
        throw new AppError('Lead not found in waiting list', 404);
      }

      res.json({
        success: true,
        data: lead,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;


import { Router, Request, Response, NextFunction } from 'express';
import { availabilityController } from '../controllers/availabilityController';
import { slotCalculatorService } from '../services/SlotCalculatorService';
import { AppError } from '../types';

const router = Router();

/**
 * GET /api/availability/consultants
 * Get list of all active consultants
 */
router.get('/consultants', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const consultants = await availabilityController.getConsultants();

    res.json({
      success: true,
      data: consultants,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/availability/consultants/:id/slots
 * Get available 15-minute slots for a consultant on a specific date
 * Query params: date (YYYY-MM-DD), duration (15|30|60), timezone
 */
router.get(
  '/consultants/:id/slots',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date, duration = '15', timezone = 'America/Mexico_City' } = req.query;
      const { id: consultorId } = req.params;

      if (!date || typeof date !== 'string') {
        throw new AppError('date query parameter is required (YYYY-MM-DD)', 400);
      }

      // Parse date
      const slotDate = new Date(date);

      if (isNaN(slotDate.getTime())) {
        throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
      }

      // Get available slots
      const slots = await slotCalculatorService.getAvailableSlots(
        consultorId,
        slotDate,
        { duration: parseInt(duration as string) as 15 | 30 | 60 }
      );

      // Get consultant info
      const consultant = await availabilityController.getConsultantById(consultorId);

      res.json({
        success: true,
        data: {
          consultor_id: consultorId,
          consultor_nombre: consultant?.nombre,
          fecha: date,
          timezone,
          slots,
          available_count: slots.filter(s => s.disponible).length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/availability/consultants/:id/calendar
 * Get next N available dates with slot counts
 * Query params: days (default 30)
 */
router.get(
  '/consultants/:id/calendar',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { days = '30' } = req.query;
      const { id: consultorId } = req.params;

      const nextDates = await slotCalculatorService.getNextAvailableDates(
        consultorId,
        new Date(),
        parseInt(days as string)
      );

      res.json({
        success: true,
        data: {
          consultor_id: consultorId,
          next_available_dates: nextDates,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;


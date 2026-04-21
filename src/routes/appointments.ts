import { Router, Request, Response, NextFunction } from 'express';
import { appointmentController } from '../controllers/appointmentController';
import { validationService } from '../services/ValidationService';
import { AppError, AppointmentBookingRequest } from '../types';

const router = Router();

/**
 * POST /api/appointments
 * Create a new appointment
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get clientId from request (set by middleware or query)
    const clientId = req.query.cliente_id as string || req.body.cliente_id;

    if (!clientId) {
      throw new AppError('cliente_id is required', 400);
    }

    // Validate booking request
    const validation = validationService.validateAppointmentBooking(req.body);

    if (!validation.valid) {
      throw new AppError('Validation failed', 400);
    }

    const bookingData: AppointmentBookingRequest = req.body;

    // Create appointment
    const appointment = await appointmentController.createAppointment(
      clientId,
      bookingData
    );

    res.status(201).json({
      success: true,
      data: appointment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments/:id
 * Get appointment details
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const appointment = await appointmentController.getAppointment(id);

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    res.json({
      success: true,
      data: appointment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/appointments
 * Get appointments (for client or consultant)
 * Query params: cliente_id or consultor_id, from, to
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cliente_id, consultor_id, from, to } = req.query;

    let appointments = [];

    if (cliente_id) {
      appointments = await appointmentController.getClientAppointments(
        cliente_id as string
      );
    } else if (consultor_id) {
      appointments = await appointmentController.getConsultantAppointments(
        consultor_id as string,
        from ? new Date(from as string) : undefined,
        to ? new Date(to as string) : undefined
      );
    } else {
      throw new AppError('cliente_id or consultor_id query parameter is required', 400);
    }

    res.json({
      success: true,
      data: appointments,
      count: appointments.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/appointments/:id
 * Update appointment status
 */
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
      throw new AppError('estado is required', 400);
    }

    const validStates = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_show'];

    if (!validStates.includes(estado)) {
      throw new AppError(`Invalid estado. Must be one of: ${validStates.join(', ')}`, 400);
    }

    const updated = await appointmentController.updateAppointmentStatus(id, estado);

    if (!updated) {
      throw new AppError('Appointment not found', 404);
    }

    res.json({
      success: true,
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/appointments/:id
 * Cancel appointment
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    await appointmentController.cancelAppointment(id);

    res.json({
      success: true,
      message: 'Appointment cancelled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

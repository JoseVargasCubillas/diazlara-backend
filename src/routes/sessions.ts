import { Router, Request, Response, NextFunction } from 'express';
import { leadController } from '../controllers/leadController';
import { AppError, LeadSubmissionRequest } from '../types';

const router = Router();

const normalizeMxPhone = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D/g, '');

  if (digits.length === 10) {
    return `52${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('52')) {
    return digits;
  }

  return digits;
};

/**
 * POST /api/sessions/bookings
 * Compatibility endpoint for landing form submissions.
 */
router.post('/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      email,
      phone,
      services,
      source,
      company,
      position,
      notes,
    } = req.body || {};

    if (!name || !email) {
      throw new AppError('name and email are required', 400, 'MISSING_FIELDS');
    }

    const leadData: LeadSubmissionRequest = {
      nombre: String(name).trim(),
      email: String(email).trim(),
      telefono_whatsapp: normalizeMxPhone(phone),
      empresa: company ? String(company).trim() : undefined,
      puesto: position ? String(position).trim() : undefined,
      servicios: Array.isArray(services) ? services.map((item) => String(item)) : [],
      origen: source === 'referido' || source === 'masterclass' ? source : 'web',
      notas: notes ? String(notes).trim() : undefined,
    };

    const result = await leadController.createLead(leadData);

    res.status(201).json({
      success: true,
      message: 'Booking request stored successfully',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

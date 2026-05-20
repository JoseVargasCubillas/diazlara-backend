import { Router, Request, Response, NextFunction } from 'express';
import { LeadSubmissionRequest, AppError } from '../types';
import { leadController } from '../controllers/leadController';

const router = Router();

const normalizeMxPhone = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const digits = String(value).replace(/\D/g, '');

  if (digits.length === 10) {
    return `52${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('52')) {
    return digits;
  }

  return digits || undefined;
};

const normalizeLeadPayload = (body: any): LeadSubmissionRequest => ({
  nombre: String(body?.nombre ?? body?.name ?? '').trim(),
  apellido: body?.apellido ? String(body.apellido).trim() : undefined,
  email: String(body?.email ?? '').trim(),
  telefono_whatsapp: normalizeMxPhone(body?.telefono_whatsapp ?? body?.phone),
  empresa: body?.empresa ?? body?.company ? String(body.empresa ?? body.company).trim() : undefined,
  puesto: body?.puesto ?? body?.position ? String(body.puesto ?? body.position).trim() : undefined,
  servicios: Array.isArray(body?.servicios)
    ? body.servicios.map(String)
    : Array.isArray(body?.services)
      ? body.services.map(String)
      : [],
  origen: body?.origen === 'referido' || body?.origen === 'masterclass'
    ? body.origen
    : body?.source === 'referido' || body?.source === 'masterclass'
      ? body.source
      : 'web',
  notas: body?.notas ?? body?.notes ? String(body.notas ?? body.notes).trim() : undefined,
});

/**
 * POST /api/leads
 * Create a new lead from form submission
 */
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leadData = normalizeLeadPayload(req.body);

      // Basic validation
      if (!leadData.nombre || !leadData.email) {
        throw new AppError('nombre/name and email are required', 400, 'MISSING_FIELDS');
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


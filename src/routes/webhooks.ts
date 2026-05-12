import { Router, Request, Response } from 'express';
import { whatsAppService } from '../services/WhatsAppService';
import { env } from '../config/environment';
import { logger } from '../config/logger';

const router = Router();

/**
 * POST /api/webhooks/whapi - WhatsApp delivery status / inbound messages from Whapi.
 * Optional shared secret check via WHAPI_WEBHOOK_SECRET (header `x-webhook-secret`).
 */
router.post('/whapi', async (req: Request, res: Response) => {
  try {
    if (env.WHAPI_WEBHOOK_SECRET) {
      const provided = req.header('x-webhook-secret');
      if (provided !== env.WHAPI_WEBHOOK_SECRET) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
      }
    }

    await whatsAppService.handleStatusCallback(req.body);
    return res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('Whapi webhook error:', error);
    return res.status(500).json({ success: false });
  }
});

// Backward-compat alias for any infra still pointing to /twilio
router.post('/twilio', async (req: Request, res: Response) => {
  await whatsAppService.handleStatusCallback(req.body);
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// POST /api/webhooks/hubspot - HubSpot webhook (optional)
router.post('/hubspot', (_req: Request, res: Response) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

export default router;

import { Router, Request, Response } from 'express';

const router = Router();

// POST /api/webhooks/twilio - WhatsApp delivery status
router.post('/twilio', (_req: Request, res: Response) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// POST /api/webhooks/hubspot - HubSpot webhook (optional)
router.post('/hubspot', (_req: Request, res: Response) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

export default router;

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/environment';
import { logger } from '../config/logger';
import { templateService } from './TemplateService';
import { getDatabase } from '../config/database';

let whapiClient: AxiosInstance | null = null;

type WhatsAppTemplateType = 'confirmacion' | 'recordatorio' | 'seguimiento' | 'cancelacion';
type NotificationType = WhatsAppTemplateType | 'recordatorio_1h';

function getClient(): AxiosInstance | null {
  if (whapiClient) return whapiClient;

  if (!env.WHAPI_TOKEN) {
    logger.warn('Whapi not configured: WHAPI_TOKEN missing');
    return null;
  }

  whapiClient = axios.create({
    baseURL: env.WHAPI_URL,
    headers: {
      Authorization: `Bearer ${env.WHAPI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  return whapiClient;
}

/**
 * Whapi expects the recipient as `<digits>@s.whatsapp.net` (or full JID).
 * Accept formats like "+5215512345678", "5215512345678", "5512345678".
 * For Mexican mobile numbers (10 digits) we prefix with "521" — WhatsApp's
 * mobile prefix for MX is "521", not just "52", and Whapi will mark the
 * message as `pending` forever if the JID does not exist.
 */
function normalizeRecipient(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';

  let withCountry = digits;
  if (withCountry.length === 10) {
    // 10-digit local Mexican number → 521 + number
    withCountry = `521${withCountry}`;
  } else if (withCountry.length === 12 && withCountry.startsWith('52')) {
    // 52 + 10 digits → insert mobile "1" → 521 + 10 digits
    withCountry = `521${withCountry.slice(2)}`;
  }

  return `${withCountry}@s.whatsapp.net`;
}

export class WhatsAppService {
  /**
   * Send WhatsApp text message via Whapi
   */
  async sendMessage(
    toPhoneNumber: string,
    messageText: string,
    citaId?: string,
    notificationType: NotificationType = 'confirmacion'
  ): Promise<{ sid: string; status: 'queued' | 'sent' | 'failed' }> {
    try {
      const client = getClient();
      if (!client) {
        if (citaId) {
          await this.logNotification(citaId, 'whatsapp', '', notificationType, 'fallido', messageText);
        }
        return { sid: '', status: 'failed' };
      }

      const to = normalizeRecipient(toPhoneNumber);
      if (!to) {
        logger.warn(`Invalid WhatsApp recipient: ${toPhoneNumber}`);
        if (citaId) {
          await this.logNotification(citaId, 'whatsapp', '', notificationType, 'fallido', messageText);
        }
        return { sid: '', status: 'failed' };
      }

      const response = await client.post('/messages/text', {
        to,
        body: messageText,
      });

      const data = response.data || {};
      const messageId: string =
        data.message?.id || data.id || data.sent?.id || '';

      logger.info(`WhatsApp message sent: ${messageId || '(no id)'} to ${toPhoneNumber}`);

      if (citaId) {
        await this.logNotification(
          citaId,
          'whatsapp',
          messageId,
          notificationType,
          data.sent === false ? 'fallido' : 'enviado',
          messageText
        );
      }

      return {
        sid: messageId,
        status: data.sent === false ? 'failed' : 'sent',
      };
    } catch (error: any) {
      const detail = axios.isAxiosError(error)
        ? error.response?.data || error.message
        : error;
      logger.error(`Failed to send WhatsApp to ${toPhoneNumber}:`, detail);
      if (citaId) {
        await this.logNotification(citaId, 'whatsapp', '', notificationType, 'fallido', messageText);
      }
      return { sid: '', status: 'failed' };
    }
  }

  /**
   * Send WhatsApp using template
   */
  async sendFromTemplate(
    toPhoneNumber: string,
    templateType: WhatsAppTemplateType,
    variables: Record<string, string>,
    citaId: string,
    notificationType: NotificationType = templateType
  ): Promise<{ sid: string; status: 'queued' | 'sent' | 'failed' }> {
    try {
      const messageText = await templateService.renderFromDatabase(
        'whatsapp',
        templateType,
        variables
      );

      return this.sendMessage(toPhoneNumber, messageText, citaId, notificationType);
    } catch (error) {
      logger.error(`Failed to send WhatsApp template to ${toPhoneNumber}:`, error);
      return { sid: '', status: 'failed' };
    }
  }

  /**
   * Handle delivery status callback from Whapi.
   * Whapi posts a payload with `statuses: [{ id, status, recipient_id, ... }]`.
   */
  async handleStatusCallback(eventData: any): Promise<void> {
    try {
      const statuses: any[] = eventData?.statuses || [];
      for (const s of statuses) {
        logger.info(`WhatsApp status update: ${s.id} -> ${s.status}`);
      }
    } catch (error) {
      logger.error('Error handling WhatsApp status callback:', error);
    }
  }

  /**
   * Log notification in database
   */
  private async logNotification(
    citaId: string,
    canal: string,
    _messageId: string,
    tipo: NotificationType,
    estado: 'enviado' | 'fallido',
    contenido: string
  ): Promise<void> {
    try {
      const pool = await getDatabase();

      await pool.execute(
        `INSERT INTO NOTIFICACIONES (id, cita_id, canal, tipo, estado, contenido, enviado_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), citaId, canal, tipo, estado, contenido, estado === 'enviado' ? new Date() : null]
      );
    } catch (error) {
      logger.error('Error logging notification:', error);
    }
  }

  /**
   * Validate phone number format (México: 10 dígitos, opcional +52)
   */
  validatePhone(phone: string): boolean {
    const phoneRegex = /^(\+?52)?[\d]{10}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }
}

export const whatsAppService = new WhatsAppService();

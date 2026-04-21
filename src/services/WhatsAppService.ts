import twilio from 'twilio';
import { env } from '../config/environment';
import { logger } from '../config/logger';
import { templateService } from './TemplateService';
import { getDatabase } from '../config/database';

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export class WhatsAppService {
  /**
   * Send WhatsApp message directly
   */
  async sendMessage(
    toPhoneNumber: string,
    messageText: string,
    citaId?: string
  ): Promise<{ sid: string; status: 'queued' | 'sent' | 'failed' }> {
    try {
      // Format phone number: +52 prefix
      const formattedPhone = toPhoneNumber.startsWith('+')
        ? toPhoneNumber
        : `+${toPhoneNumber}`;

      const message = await twilioClient.messages.create({
        from: `whatsapp:${env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${formattedPhone}`,
        body: messageText,
      });

      logger.info(`WhatsApp message sent: ${message.sid} to ${toPhoneNumber}`);

      // Log notification in database
      if (citaId) {
        await this.logNotification(citaId, 'whatsapp', message.sid, messageText);
      }

      return {
        sid: message.sid,
        status: 'queued',
      };
    } catch (error) {
      logger.error(`Failed to send WhatsApp to ${toPhoneNumber}:`, error);
      return {
        sid: '',
        status: 'failed',
      };
    }
  }

  /**
   * Send WhatsApp using template
   */
  async sendFromTemplate(
    toPhoneNumber: string,
    templateType: 'confirmacion' | 'recordatorio' | 'seguimiento' | 'cancelacion',
    variables: Record<string, string>,
    citaId: string
  ): Promise<{ sid: string; status: 'queued' | 'sent' | 'failed' }> {
    try {
      const messageText = await templateService.renderFromDatabase(
        'whatsapp',
        templateType,
        variables
      );

      return this.sendMessage(toPhoneNumber, messageText, citaId);
    } catch (error) {
      logger.error(`Failed to send WhatsApp template to ${toPhoneNumber}:`, error);
      return {
        sid: '',
        status: 'failed',
      };
    }
  }

  /**
   * Handle delivery status callback from Twilio
   */
  async handleStatusCallback(eventData: any): Promise<void> {
    try {
      const { MessageSid, MessageStatus } = eventData;

      logger.info(`WhatsApp status update: ${MessageSid} -> ${MessageStatus}`);

      // Map Twilio status to our status
      // const statusMap: Record<string, string> = {
      //   queued: 'pendiente',
      //   sent: 'enviado',
      //   delivered: 'enviado',
      //   read: 'enviado',
      //   failed: 'fallido',
      //   undelivered: 'fallido',
      // };

      // TODO: Update notification status (would need to find notification by MessageSid)
      // This would be implemented when we create the notification record with MessageSid
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
    _messageSid: string,
    contenido: string
  ): Promise<void> {
    try {
      const pool = await getDatabase();
      const { v4: uuidv4 } = await import('uuid');

      await pool.execute(
        `INSERT INTO NOTIFICACIONES (id, cita_id, canal, tipo, estado, contenido, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [uuidv4(), citaId, canal, 'confirmacion', 'enviado', contenido]
      );
    } catch (error) {
      logger.error('Error logging notification:', error);
    }
  }

  /**
   * Validate phone number format
   */
  validatePhone(phone: string): boolean {
    // México format: 5212345678 or +5212345678
    const phoneRegex = /^(\+?52)?[\d]{10}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }
}

export const whatsAppService = new WhatsAppService();

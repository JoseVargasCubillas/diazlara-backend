import sgMail from '@sendgrid/mail';
import { env } from '../config/environment';
import { logger } from '../config/logger';
import { templateService } from './TemplateService';

if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}
export class EmailService {
  /**
   * Send email directly
   */
  async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    plainText?: string
  ): Promise<{ messageId: string; status: 'sent' | 'failed' }> {
    try {
      const msg = {
        to,
        from: env.SENDGRID_FROM_EMAIL || 'noreply@diazlara.mx',
        fromName: env.SENDGRID_FROM_NAME,
        subject,
        text: plainText || htmlContent,
        html: htmlContent,
        replyTo: 'contacto@diazlara.mx',
      };

      const [response] = await sgMail.send(msg);

      logger.info(`Email sent to ${to}: ${response.headers['x-message-id']}`);

      return {
        messageId: (response.headers['x-message-id'] as string) || '',
        status: 'sent',
      };
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      return {
        messageId: '',
        status: 'failed',
      };
    }
  }

  /**
   * Send email using template
   */
  async sendFromTemplate(
    to: string,
    templateType: 'confirmacion' | 'recordatorio' | 'seguimiento' | 'cancelacion',
    variables: Record<string, string>
  ): Promise<{ messageId: string; status: 'sent' | 'failed' }> {
    try {
      // Render template
      const htmlContent = await templateService.renderFromDatabase(
        'email',
        templateType,
        variables
      );

      // Extract subject from first line or create default
      const subject = variables.subject || `Díaz Lara Consultores - ${templateType}`;

      return this.sendEmail(to, subject, htmlContent);
    } catch (error) {
      logger.error(`Failed to send template email to ${to}:`, error);
      return {
        messageId: '',
        status: 'failed',
      };
    }
  }

  /**
   * Send email with calendar attachment (ICS)
   */
  async sendWithCalendarAttachment(
    to: string,
    subject: string,
    htmlContent: string,
    icsContent: string
  ): Promise<{ messageId: string; status: 'sent' | 'failed' }> {
    try {
      const msg = {
        to,
        from: env.SENDGRID_FROM_EMAIL,
        fromName: env.SENDGRID_FROM_NAME,
        subject,
        html: htmlContent,
        text: htmlContent,
        replyTo: 'contacto@diazlara.mx',
        attachments: [
          {
            content: Buffer.from(icsContent).toString('base64'),
            filename: 'appointment.ics',
            type: 'text/calendar',
            disposition: 'attachment',
          },
        ],
      };

      const [response] = await sgMail.send(msg);

      logger.info(`Email with calendar sent to ${to}`);

      return {
        messageId: response.headers['x-message-id'] || '',
        status: 'sent',
      };
    } catch (error) {
      logger.error(`Failed to send email with attachment to ${to}:`, error);
      return {
        messageId: '',
        status: 'failed',
      };
    }
  }

  /**
   * Validate email address
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const emailService = new EmailService();

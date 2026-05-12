import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/environment';
import { logger } from '../config/logger';
import { templateService } from './TemplateService';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn('SMTP not configured: SMTP_HOST/SMTP_USER/SMTP_PASS missing');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465, false for 587/STARTTLS
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  // Async verify – do not block sending
  transporter
    .verify()
    .then(() => logger.info(`✓ SMTP ready (${env.SMTP_HOST}:${env.SMTP_PORT})`))
    .catch((err) => logger.error('SMTP verification failed:', err));

  return transporter;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class EmailService {
  /**
   * Send email directly via SMTP
   */
  async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    plainText?: string
  ): Promise<{ messageId: string; status: 'sent' | 'failed' }> {
    try {
      const tx = getTransporter();
      if (!tx) {
        return { messageId: '', status: 'failed' };
      }

      const info = await tx.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text: plainText || stripHtml(htmlContent),
        html: htmlContent,
        replyTo: env.SMTP_REPLY_TO,
        encoding: 'utf-8',
        textEncoding: 'base64',
      });

      logger.info(`Email sent to ${to}: ${info.messageId}`);

      return {
        messageId: info.messageId || '',
        status: 'sent',
      };
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      return { messageId: '', status: 'failed' };
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
      const htmlContent = await templateService.renderFromDatabase(
        'email',
        templateType,
        variables
      );

      const subject = variables.subject || `Díaz Lara Consultores - ${templateType}`;

      return this.sendEmail(to, subject, htmlContent);
    } catch (error) {
      logger.error(`Failed to send template email to ${to}:`, error);
      return { messageId: '', status: 'failed' };
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
      const tx = getTransporter();
      if (!tx) {
        return { messageId: '', status: 'failed' };
      }

      const info = await tx.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text: stripHtml(htmlContent),
        html: htmlContent,
        replyTo: env.SMTP_REPLY_TO,
        attachments: [
          {
            filename: 'appointment.ics',
            content: icsContent,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      });

      logger.info(`Email with calendar sent to ${to}: ${info.messageId}`);

      return {
        messageId: info.messageId || '',
        status: 'sent',
      };
    } catch (error) {
      logger.error(`Failed to send email with attachment to ${to}:`, error);
      return { messageId: '', status: 'failed' };
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

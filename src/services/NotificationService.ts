import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { emailService } from './EmailService';
import { whatsAppService } from './WhatsAppService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';

type ReminderHours = 24 | 1;
type ReminderNotificationType = 'recordatorio' | 'recordatorio_1h';

const ACTIVE_APPOINTMENT_STATES = ['pendiente', 'agendada', 'confirmada'];

const reminderTypeFor = (hoursBeforeAppointment: ReminderHours): ReminderNotificationType =>
  hoursBeforeAppointment === 1 ? 'recordatorio_1h' : 'recordatorio';

export class NotificationService {
  /**
   * Send confirmation notification after appointment booking
   */
  async sendConfirmationNotification(citaId: string): Promise<void> {
    try {
      const pool = await getDatabase();

      // Get appointment details
      const [citaRows] = await pool.execute(
        `SELECT c.*, cl.nombre, cl.email, cl.telefono_whatsapp,
                co.nombre as consultor_nombre
         FROM CITAS c
         JOIN CLIENTES cl ON c.cliente_id = cl.id
         JOIN CONSULTORES co ON c.consultor_id = co.id
         WHERE c.id = ?`,
        [citaId]
      );

      if (!Array.isArray(citaRows) || citaRows.length === 0) {
        throw new Error('Appointment not found');
      }

      const cita = citaRows[0] as any;
      const fecha = format(new Date(cita.fecha_hora_inicio), 'dd MMMM yyyy', { locale: es });
      const hora = format(new Date(cita.fecha_hora_inicio), 'HH:mm', { locale: es });

      const variables = {
        nombre: cita.nombre,
        apellido: cita.apellido || '',
        consultor: cita.consultor_nombre,
        fecha,
        hora,
        meet_link: cita.meet_link || '',
        subject: `Confirmación de tu sesión · Díaz Lara Consultores · ${fecha} ${hora}`,
      };

      // Send email
      if (cita.email) {
        await emailService.sendFromTemplate(
          cita.email,
          'confirmacion',
          variables
        );
      }

      // Send WhatsApp
      if (cita.telefono_whatsapp) {
        await whatsAppService.sendFromTemplate(
          cita.telefono_whatsapp,
          'confirmacion',
          variables,
          citaId
        );
      }

      logger.info(`Confirmation notifications sent for appointment ${citaId}`);
    } catch (error) {
      logger.error('Error sending confirmation notification:', error);
      throw error;
    }
  }

  /**
   * Send reminder 24 hours before appointment
   */
  async sendReminderNotification(citaId: string, hoursBeforeAppointment: ReminderHours = 24): Promise<void> {
    try {
      const pool = await getDatabase();
      const notificationType = reminderTypeFor(hoursBeforeAppointment);

      const [citaRows] = await pool.execute(
        `SELECT c.*, cl.nombre, cl.email, cl.telefono_whatsapp,
                co.nombre as consultor_nombre
         FROM CITAS c
         JOIN CLIENTES cl ON c.cliente_id = cl.id
         JOIN CONSULTORES co ON c.consultor_id = co.id
         WHERE c.id = ? AND c.estado IN (?, ?)`,
        [citaId, ...ACTIVE_APPOINTMENT_STATES]
      );

      if (!Array.isArray(citaRows) || citaRows.length === 0) {
        return;
      }

      const cita = citaRows[0] as any;
      const hora = format(new Date(cita.fecha_hora_inicio), 'HH:mm', { locale: es });

      const variables = {
        nombre: cita.nombre,
        hora,
        meet_link: cita.meet_link || '',
        subject: `Recordatorio · Tu sesión es hoy a las ${hora}`,
      };

      if (cita.email) {
        const emailResult = await emailService.sendFromTemplate(
          cita.email,
          'recordatorio',
          variables
        );
        await this.logNotification(
          citaId,
          'email',
          notificationType,
          emailResult.status === 'sent' ? 'enviado' : 'fallido',
          `Email reminder ${hoursBeforeAppointment}h`
        );
      }

      // Send WhatsApp reminder (preferred for close reminders)
      if (cita.telefono_whatsapp) {
        await whatsAppService.sendFromTemplate(
          cita.telefono_whatsapp,
          'recordatorio',
          variables,
          citaId,
          notificationType
        );
      }

      logger.info(`${hoursBeforeAppointment}h reminder sent for appointment ${citaId}`);
    } catch (error) {
      logger.error('Error sending reminder notification:', error);
    }
  }

  /**
   * Send follow-up after completed appointment
   */
  async sendFollowupNotification(citaId: string): Promise<void> {
    try {
      const pool = await getDatabase();

      const [citaRows] = await pool.execute(
        `SELECT c.*, cl.nombre, cl.email, cl.telefono_whatsapp
         FROM CITAS c
         JOIN CLIENTES cl ON c.cliente_id = cl.id
         WHERE c.id = ?`,
        [citaId]
      );

      if (!Array.isArray(citaRows) || citaRows.length === 0) {
        return;
      }

      const cita = citaRows[0] as any;

      const variables = {
        
        nombre: cita.nombre,
      };

      // Send email with survey/feedback link
      if (cita.email) {
        await emailService.sendFromTemplate(
          cita.email,
          'seguimiento',
          variables
        );
      }

      logger.info(`Follow-up notification sent for appointment ${citaId}`);
    } catch (error) {
      logger.error('Error sending follow-up notification:', error);
    }
  }

  /**
   * Send cancellation notification
   */
  async sendCancellationNotification(citaId: string): Promise<void> {
    try {
      const pool = await getDatabase();

      const [citaRows] = await pool.execute(
        `SELECT c.*, cl.nombre, cl.email, cl.telefono_whatsapp
         FROM CITAS c
         JOIN CLIENTES cl ON c.cliente_id = cl.id
         WHERE c.id = ?`,
        [citaId]
      );

      if (!Array.isArray(citaRows) || citaRows.length === 0) {
        return;
      }

      const cita = citaRows[0] as any;

      const variables = {
        nombre: cita.nombre,
      };

      // Send cancellation notification
      if (cita.email) {
        await emailService.sendFromTemplate(
          cita.email,
          'cancelacion',
          variables
        );
      }

      if (cita.telefono_whatsapp) {
        await whatsAppService.sendFromTemplate(
          cita.telefono_whatsapp,
          'cancelacion',
          variables,
          citaId
        );
      }

      logger.info(`Cancellation notification sent for appointment ${citaId}`);
    } catch (error) {
      logger.error('Error sending cancellation notification:', error);
    }
  }

  /**
   * Schedule and send pending reminders
   * Call this periodically (e.g., via cron job)
   */
  async processPendingReminders(): Promise<void> {
    try {
      const pool = await getDatabase();

      // Get appointments that need 24h reminder (within next 24-25 hours)
      const [citasFor24h] = await pool.execute(
        `SELECT id FROM CITAS
         WHERE estado IN (?, ?)
         AND DATE_ADD(NOW(), INTERVAL 23 HOUR) < fecha_hora_inicio
         AND DATE_ADD(NOW(), INTERVAL 25 HOUR) > fecha_hora_inicio
         AND id NOT IN (
           SELECT DISTINCT cita_id FROM NOTIFICACIONES
           WHERE tipo = 'recordatorio' AND created_at > DATE_SUB(NOW(), INTERVAL 2 DAY)
         )`,
        ACTIVE_APPOINTMENT_STATES
      );

      for (const row of (citasFor24h as any[])) {
        await this.sendReminderNotification(row.id, 24);
      }

      // Get appointments that need 1h reminder (within next 55min-65min)
      const [citasFor1h] = await pool.execute(
        `SELECT id FROM CITAS
         WHERE estado IN (?, ?)
         AND DATE_ADD(NOW(), INTERVAL 55 MINUTE) < fecha_hora_inicio
         AND DATE_ADD(NOW(), INTERVAL 65 MINUTE) > fecha_hora_inicio
         AND id NOT IN (
           SELECT DISTINCT cita_id FROM NOTIFICACIONES
           WHERE tipo = 'recordatorio_1h' AND created_at > DATE_SUB(NOW(), INTERVAL 2 DAY)
         )`,
        ACTIVE_APPOINTMENT_STATES
      );

      for (const row of (citasFor1h as any[])) {
        await this.sendReminderNotification(row.id, 1);
      }

      logger.info('Pending reminders processed');
    } catch (error) {
      logger.error('Error processing pending reminders:', error);
    }
  }

  /**
   * Retry failed notifications
   */
  async retryFailedNotifications(): Promise<void> {
    try {
      const pool = await getDatabase();

      // Get failed notifications that haven't been retried too many times
      const [failedNotifs] = await pool.execute(
        `SELECT id, cita_id FROM NOTIFICACIONES
         WHERE estado = 'fallido'
         AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`
      );

      logger.info(`Retrying ${(failedNotifs as any[]).length} failed notifications`);
    } catch (error) {
      logger.error('Error retrying failed notifications:', error);
    }
  }

  private async logNotification(
    citaId: string,
    canal: 'email' | 'whatsapp',
    tipo: ReminderNotificationType,
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
}

export const notificationService = new NotificationService();

import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import {
  Cita,
  AppointmentBookingRequest,
  NotFoundError,
  ConflictError,
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { slotCalculatorService } from '../services/SlotCalculatorService';
import { notificationService } from '../services/NotificationService';
import { googleMeetService } from '../services/GoogleMeetService';

class AppointmentController {
  /**
   * Create a new appointment
   */
  async createAppointment(
    clientId: string,
    data: AppointmentBookingRequest
  ): Promise<Cita> {
    try {
      const pool = await getDatabase();

      // Verify client exists
      const [clientRows] = await pool.execute(
        'SELECT id FROM CLIENTES WHERE id = ?',
        [clientId]
      );

      if (!Array.isArray(clientRows) || clientRows.length === 0) {
        throw new NotFoundError('Client not found');
      }

      // Verify consultant exists
      const [consultorRows] = await pool.execute(
        'SELECT id FROM CONSULTORES WHERE id = ? AND activo = 1',
        [data.consultor_id]
      );

      if (!Array.isArray(consultorRows) || consultorRows.length === 0) {
        throw new NotFoundError('Consultant not found');
      }

      // Check slot availability
      const startTime = new Date(data.fecha_hora_inicio);
      const endTime = new Date(data.fecha_hora_fin);

      const isAvailable = await slotCalculatorService.isSlotAvailable(
        data.consultor_id,
        startTime,
        endTime
      );

      if (!isAvailable) {
        throw new ConflictError('Time slot is not available', {
          consultorId: data.consultor_id,
          startTime: data.fecha_hora_inicio,
          endTime: data.fecha_hora_fin,
        });
      }

      // Get consultant and client details for Google Meet
      const [consultorDetails] = await pool.execute(
        'SELECT email, nombre FROM CONSULTORES WHERE id = ?',
        [data.consultor_id]
      );

      const [clientDetails] = await pool.execute(
        'SELECT email, nombre FROM CLIENTES WHERE id = ?',
        [clientId]
      );

      if (!Array.isArray(consultorDetails) || consultorDetails.length === 0) {
        throw new NotFoundError('Consultant details not found');
      }

      if (!Array.isArray(clientDetails) || clientDetails.length === 0) {
        throw new NotFoundError('Client details not found');
      }

      const consultant = consultorDetails[0] as any;
      const client = clientDetails[0] as any;

      // Generate Google Meet link
      const meetLink = await googleMeetService.generateMeetLink(
        consultant.email,
        client.email,
        client.nombre,
        startTime,
        endTime
      );

      // Create appointment
      const citaId = uuidv4();

      await pool.execute(
        `INSERT INTO CITAS
         (id, cliente_id, consultor_id, fecha_hora_inicio, fecha_hora_fin, estado, meet_link, notas_cliente, created_at)
         VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?, NOW())`,
        [
          citaId,
          clientId,
          data.consultor_id,
          startTime,
          endTime,
          meetLink,
          data.notas_cliente || null,
        ]
      );

      logger.info(`Appointment created: ${citaId}`);

      // Send confirmation notifications (async, don't wait)
      setImmediate(() => {
        notificationService.sendConfirmationNotification(citaId).catch((err) => {
          logger.error('Failed to send confirmation notification:', err);
        });
      });

      // Return created appointment
      return {
        id: citaId,
        cliente_id: clientId,
        consultor_id: data.consultor_id,
        fecha_hora_inicio: startTime,
        fecha_hora_fin: endTime,
        estado: 'pendiente',
        meet_link: meetLink,
        notas_cliente: data.notas_cliente,
        created_at: new Date(),
      };
    } catch (error) {
      logger.error('Error creating appointment:', error);
      throw error;
    }
  }

  /**
   * Get appointment by ID
   */
  async getAppointment(citaId: string): Promise<Cita | null> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        'SELECT * FROM CITAS WHERE id = ?',
        [citaId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0] as Cita;
      }

      return null;
    } catch (error) {
      logger.error('Error retrieving appointment:', error);
      throw error;
    }
  }

  /**
   * Get appointments for a client
   */
  async getClientAppointments(clientId: string): Promise<Cita[]> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT * FROM CITAS
         WHERE cliente_id = ?
         ORDER BY fecha_hora_inicio DESC`,
        [clientId]
      );

      return Array.isArray(rows) ? (rows as Cita[]) : [];
    } catch (error) {
      logger.error('Error retrieving client appointments:', error);
      throw error;
    }
  }

  /**
   * Get appointments for a consultant
   */
  async getConsultantAppointments(
    consultorId: string,
    from?: Date,
    to?: Date
  ): Promise<Cita[]> {
    try {
      const pool = await getDatabase();

      let query = 'SELECT * FROM CITAS WHERE consultor_id = ?';
      const params: any[] = [consultorId];

      if (from && to) {
        query += ' AND fecha_hora_inicio >= ? AND fecha_hora_fin <= ?';
        params.push(from, to);
      }

      query += ' ORDER BY fecha_hora_inicio ASC';

      const [rows] = await pool.execute(query, params);

      return Array.isArray(rows) ? (rows as Cita[]) : [];
    } catch (error) {
      logger.error('Error retrieving consultant appointments:', error);
      throw error;
    }
  }

  /**
   * Update appointment status
   */
  async updateAppointmentStatus(
    citaId: string,
    estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show'
  ): Promise<Cita | null> {
    try {
      const pool = await getDatabase();

      // Get current appointment
      const cita = await this.getAppointment(citaId);

      if (!cita) {
        throw new NotFoundError('Appointment not found');
      }

      // Update status
      await pool.execute(
        'UPDATE CITAS SET estado = ? WHERE id = ?',
        [estado, citaId]
      );

      logger.info(`Appointment status updated: ${citaId} -> ${estado}`);

      // Send notifications based on status change
      if (estado === 'cancelada') {
        setImmediate(() => {
          notificationService.sendCancellationNotification(citaId).catch((err) => {
            logger.error('Failed to send cancellation notification:', err);
          });
        });
      } else if (estado === 'completada') {
        setImmediate(() => {
          notificationService.sendFollowupNotification(citaId).catch((err) => {
            logger.error('Failed to send followup notification:', err);
          });
        });
      }

      return this.getAppointment(citaId);
    } catch (error) {
      logger.error('Error updating appointment:', error);
      throw error;
    }
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(citaId: string): Promise<void> {
    try {
      await this.updateAppointmentStatus(citaId, 'cancelada');
    } catch (error) {
      logger.error('Error cancelling appointment:', error);
      throw error;
    }
  }
}

export const appointmentController = new AppointmentController();

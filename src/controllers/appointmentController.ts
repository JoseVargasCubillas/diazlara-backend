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

      const startTime = new Date(data.fecha_hora_inicio);
      const endTime = new Date(data.fecha_hora_fin);

      // 1) BD como gate primario (baratísimo).
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

      // 2) Validación adicional contra el Google Calendar de la cuenta
      //    asignada al consultor (freebusy). Si Google reporta ocupado
      //    respondemos 409 igual que ante conflictos de BD.
      const freeInGoogle = await googleMeetService.isSlotFreeInCalendar(
        data.consultor_id,
        startTime,
        endTime
      );
      if (!freeInGoogle) {
        throw new ConflictError('Time slot is not available in Google Calendar', {
          consultorId: data.consultor_id,
          startTime: data.fecha_hora_inicio,
          endTime: data.fecha_hora_fin,
        });
      }

      // Consultant and client details for Google Meet
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

      // Crea evento + Meet en la cuenta correcta. Si la cuenta no está
      // configurada, se logea y la cita queda sin Meet (modo degradado).
      let meetLink: string | null = null;
      let googleEventId: string | null = null;
      let calendarAccountKey: string | null = null;
      try {
        const evt = await googleMeetService.createEventForConsultor({
          consultorId: data.consultor_id,
          consultantEmail: consultant.email,
          clientEmail: client.email,
          clientName: client.nombre,
          startTime,
          endTime,
        });
        meetLink = evt.meetLink;
        googleEventId = evt.eventId;
        calendarAccountKey = evt.calendarAccountKey;
      } catch (meetErr: any) {
        logger.error(
          `[GoogleMeet] No se pudo generar el evento/Meet para ${client.email}: ${meetErr?.message || meetErr}`
        );
        logger.error(
          '[GoogleMeet] Revisa GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_ACCOUNTS (o GOOGLE_IMPERSONATE_USER/GOOGLE_CALENDAR_ID en modo legacy), y que el usuario impersonado tenga Domain-Wide Delegation habilitada.'
        );
      }

      const citaId = uuidv4();
      await pool.execute(
        `INSERT INTO CITAS
         (id, cliente_id, consultor_id, fecha_hora_inicio, fecha_hora_fin, estado,
          meet_link, google_event_id, calendar_account_key, notas_cliente, created_at)
         VALUES (?, ?, ?, ?, ?, 'agendada', ?, ?, ?, ?, NOW())`,
        [
          citaId,
          clientId,
          data.consultor_id,
          startTime,
          endTime,
          meetLink,
          googleEventId,
          calendarAccountKey,
          data.notas_cliente || null,
        ]
      );

      if (meetLink) {
        logger.info(
          `Cita ${citaId} creada con Meet ${meetLink} (cuenta=${calendarAccountKey}, eventId=${googleEventId}).`
        );
      } else {
        logger.warn(`Cita ${citaId} creada SIN Meet link — agrega el enlace manualmente.`);
      }

      setImmediate(() => {
        notificationService.sendConfirmationNotification(citaId).catch((err) => {
          logger.error('Failed to send confirmation notification:', err);
        });
      });

      return {
        id: citaId,
        cliente_id: clientId,
        consultor_id: data.consultor_id,
        fecha_hora_inicio: startTime,
        fecha_hora_fin: endTime,
        estado: 'agendada',
        meet_link: meetLink ?? undefined,
        notas_cliente: data.notas_cliente,
        created_at: new Date(),
      };
    } catch (error) {
      logger.error('Error creating appointment:', error);
      throw error;
    }
  }

  async getAppointment(citaId: string): Promise<Cita | null> {
    try {
      const pool = await getDatabase();
      const [rows] = await pool.execute('SELECT * FROM CITAS WHERE id = ?', [citaId]);
      return Array.isArray(rows) && rows.length > 0 ? rows[0] as Cita : null;
    } catch (error) {
      logger.error('Error retrieving appointment:', error);
      throw error;
    }
  }

  async getClientAppointments(clientId: string): Promise<Cita[]> {
    try {
      const pool = await getDatabase();
      const [rows] = await pool.execute(
        'SELECT * FROM CITAS WHERE cliente_id = ? ORDER BY fecha_hora_inicio DESC',
        [clientId]
      );
      return Array.isArray(rows) ? (rows as Cita[]) : [];
    } catch (error) {
      logger.error('Error retrieving client appointments:', error);
      throw error;
    }
  }

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

  async updateAppointmentStatus(
    citaId: string,
    estado: 'pendiente' | 'agendada' | 'confirmada' | 'completada' | 'cancelada' | 'no_show'
  ): Promise<Cita | null> {
    try {
      const pool = await getDatabase();
      const cita = await this.getAppointment(citaId);
      if (!cita) throw new NotFoundError('Appointment not found');

      await pool.execute('UPDATE CITAS SET estado = ? WHERE id = ?', [estado, citaId]);
      logger.info(`Appointment status updated: ${citaId} -> ${estado}`);

      if (estado === 'cancelada') {
        // Cancelar el evento en Google usando la cuenta original.
        const [rows] = await pool.execute(
          'SELECT google_event_id, calendar_account_key FROM CITAS WHERE id = ?',
          [citaId]
        );
        const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
        if (row?.google_event_id && row?.calendar_account_key) {
          setImmediate(() => {
            googleMeetService
              .cancelEvent(row.calendar_account_key, row.google_event_id)
              .catch((err) => {
                logger.error(
                  `Failed to cancel Google event ${row.google_event_id}:`,
                  err
                );
              });
          });
        }

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

import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { Calificacion, QualificationRequest, NotFoundError } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { hubspotService } from '../services/HubSpotService';

class QualificationController {
  /**
   * Create or update qualification for an appointment
   */
  async createQualification(
    consultorId: string,
    data: QualificationRequest
  ): Promise<Calificacion> {
    try {
      const pool = await getDatabase();

      // Verify appointment exists
      const [citaRows] = await pool.execute(
        `SELECT c.id, c.cliente_id, c.fecha_hora_inicio, co.nombre as consultor_nombre
         FROM CITAS c
         JOIN CONSULTORES co ON c.consultor_id = co.id
         WHERE c.id = ? AND c.consultor_id = ?`,
        [data.cita_id, consultorId]
      );

      if (!Array.isArray(citaRows) || citaRows.length === 0) {
        throw new NotFoundError('Appointment not found or unauthorized');
      }

      const cita = citaRows[0] as any;

      // Get client details for HubSpot sync
      const [clientRows] = await pool.execute(
        `SELECT id, nombre, apellido, email, telefono_whatsapp, empresa, puesto
         FROM CLIENTES
         WHERE id = ?`,
        [cita.cliente_id]
      );

      if (!Array.isArray(clientRows) || clientRows.length === 0) {
        throw new NotFoundError('Client not found');
      }

      const client = clientRows[0] as any;

      // Check if qualification already exists
      const [existingRows] = await pool.execute(
        `SELECT id FROM CALIFICACIONES WHERE cita_id = ?`,
        [data.cita_id]
      );

      const calificacionId = Array.isArray(existingRows) && existingRows.length > 0
        ? (existingRows[0] as any).id
        : uuidv4();

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        // Update existing
        await pool.execute(
          `UPDATE CALIFICACIONES
           SET resultado = ?, score_interes = ?, notas_internas = ?
           WHERE cita_id = ?`,
          [data.resultado, data.score_interes, data.notas_internas || null, data.cita_id]
        );

        logger.info(`Qualification updated: ${calificacionId}`);
      } else {
        // Create new
        await pool.execute(
          `INSERT INTO CALIFICACIONES
           (id, cita_id, consultor_id, resultado, score_interes, notas_internas, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [
            calificacionId,
            data.cita_id,
            consultorId,
            data.resultado,
            data.score_interes,
            data.notas_internas || null,
          ]
        );

        logger.info(`Qualification created: ${calificacionId}`);
      }

      // Sync qualification to HubSpot (async, don't wait)
      setImmediate(() => {
        hubspotService.syncQualification(
          {
            email: client.email,
            nombre: client.nombre,
            apellido: client.apellido,
            telefono_whatsapp: client.telefono_whatsapp,
            empresa: client.empresa,
            puesto: client.puesto,
          },
          {
            resultado: data.resultado,
            score_interes: data.score_interes,
          },
          {
            cliente_nombre: client.nombre,
            fecha_hora_inicio: new Date(cita.fecha_hora_inicio),
            consultor_nombre: cita.consultor_nombre,
          }
        ).catch((err) => {
          logger.error('Failed to sync qualification to HubSpot:', err);
        });
      });

      return this.getQualification(calificacionId);
    } catch (error) {
      logger.error('Error creating/updating qualification:', error);
      throw error;
    }
  }

  /**
   * Get qualification by ID
   */
  async getQualification(calificacionId: string): Promise<Calificacion> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT * FROM CALIFICACIONES WHERE id = ?`,
        [calificacionId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new NotFoundError('Qualification not found');
      }

      return rows[0] as Calificacion;
    } catch (error) {
      logger.error('Error retrieving qualification:', error);
      throw error;
    }
  }

  /**
   * Get qualification by appointment ID
   */
  async getQualificationByCita(citaId: string): Promise<Calificacion | null> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT * FROM CALIFICACIONES WHERE cita_id = ?`,
        [citaId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0] as Calificacion;
      }

      return null;
    } catch (error) {
      logger.error('Error retrieving qualification by appointment:', error);
      throw error;
    }
  }

  /**
   * Get non-exported qualifications (for HubSpot sync)
   */
  async getUnexportedQualifications(): Promise<Calificacion[]> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT * FROM CALIFICACIONES
         WHERE exportado_hubspot = 0
         ORDER BY created_at DESC
         LIMIT 100`
      );

      return Array.isArray(rows) ? (rows as Calificacion[]) : [];
    } catch (error) {
      logger.error('Error retrieving unexported qualifications:', error);
      throw error;
    }
  }

  /**
   * Mark qualification as exported to HubSpot
   */
  async markAsExportedToHubSpot(calificacionId: string, hubspotId: string): Promise<void> {
    try {
      const pool = await getDatabase();

      await pool.execute(
        `UPDATE CALIFICACIONES
         SET exportado_hubspot = 1, hubspot_export_at = NOW()
         WHERE id = ?`,
        [calificacionId]
      );

      logger.info(`Qualification marked as exported to HubSpot: ${calificacionId} (${hubspotId})`);
    } catch (error) {
      logger.error('Error marking qualification as exported:', error);
      throw error;
    }
  }
}

export const qualificationController = new QualificationController();

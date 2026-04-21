import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { Consultor } from '../types';

class AvailabilityController {
  /**
   * Get list of all active consultants
   */
  async getConsultants(): Promise<Partial<Consultor>[]> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT id, nombre, apellido, email, especialidad
         FROM CONSULTORES
         WHERE activo = 1
         ORDER BY nombre ASC`
      );

      logger.info(`Retrieved ${Array.isArray(rows) ? rows.length : 0} consultants`);

      return Array.isArray(rows) ? (rows as any[]) : [];
    } catch (error) {
      logger.error('Error retrieving consultants:', error);
      throw error;
    }
  }

  /**
   * Get consultant details by ID
   */
  async getConsultantById(consultorId: string): Promise<Partial<Consultor> | null> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT id, nombre, apellido, email, especialidad
         FROM CONSULTORES
         WHERE id = ? AND activo = 1`,
        [consultorId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0] as any;
      }

      return null;
    } catch (error) {
      logger.error('Error retrieving consultant:', error);
      throw error;
    }
  }
}

export const availabilityController = new AvailabilityController();

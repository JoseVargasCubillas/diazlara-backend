import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { Consultor, UnauthorizedError, NotFoundError } from '../types';
import { generateToken } from '../middleware/auth';
import bcrypt from 'bcrypt';

class AuthController {
  /**
   * Consultant login
   */
  async login(email: string, password: string): Promise<{ token: string; consultor: Partial<Consultor> }> {
    try {
      const pool = await getDatabase();

      // Get consultant by email
      const [rows] = await pool.execute(
        `SELECT id, nombre, apellido, email, password_hash, especialidad, activo
         FROM CONSULTORES
         WHERE email = ?`,
        [email]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const consultor = rows[0] as any;

      if (!consultor.activo) {
        throw new UnauthorizedError('Consultant account is inactive');
      }

      // Verify password
      if (!consultor.password_hash) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const passwordMatch = await bcrypt.compare(password, consultor.password_hash);

      if (!passwordMatch) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Generate JWT token
      const token = generateToken({
        sub: consultor.id,
        email: consultor.email,
        role: 'consultant',
      });

      logger.info(`Consultant login successful: ${email}`);

      return {
        token,
        consultor: {
          id: consultor.id,
          nombre: consultor.nombre,
          apellido: consultor.apellido,
          email: consultor.email,
          especialidad: consultor.especialidad,
        },
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Get consultant profile
   */
  async getProfile(consultorId: string): Promise<Partial<Consultor>> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT id, nombre, apellido, email, especialidad, activo, created_at
         FROM CONSULTORES
         WHERE id = ?`,
        [consultorId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new NotFoundError('Consultant not found');
      }

      return rows[0] as any;
    } catch (error) {
      logger.error('Error retrieving profile:', error);
      throw error;
    }
  }

  /**
   * Update consultant profile
   */
  async updateProfile(
    consultorId: string,
    updates: { nombre?: string; apellido?: string; especialidad?: string }
  ): Promise<Partial<Consultor>> {
    try {
      const pool = await getDatabase();

      const fields: string[] = [];
      const values: any[] = [];

      if (updates.nombre !== undefined) {
        fields.push('nombre = ?');
        values.push(updates.nombre);
      }

      if (updates.apellido !== undefined) {
        fields.push('apellido = ?');
        values.push(updates.apellido);
      }

      if (updates.especialidad !== undefined) {
        fields.push('especialidad = ?');
        values.push(updates.especialidad);
      }

      if (fields.length === 0) {
        return this.getProfile(consultorId);
      }

      values.push(consultorId);

      await pool.execute(
        `UPDATE CONSULTORES SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      logger.info(`Consultant profile updated: ${consultorId}`);

      return this.getProfile(consultorId);
    } catch (error) {
      logger.error('Error updating profile:', error);
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(
    consultorId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const pool = await getDatabase();

      // Get consultant with password hash
      const [rows] = await pool.execute(
        `SELECT password_hash FROM CONSULTORES WHERE id = ?`,
        [consultorId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new NotFoundError('Consultant not found');
      }

      const { password_hash } = rows[0] as any;

      // Verify current password
      const passwordMatch = await bcrypt.compare(currentPassword, password_hash);

      if (!passwordMatch) {
        throw new UnauthorizedError('Current password is incorrect');
      }

      // Hash new password
      const newHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await pool.execute(
        `UPDATE CONSULTORES SET password_hash = ? WHERE id = ?`,
        [newHash, consultorId]
      );

      logger.info(`Consultant password changed: ${consultorId}`);
    } catch (error) {
      logger.error('Error changing password:', error);
      throw error;
    }
  }
}

export const authController = new AuthController();

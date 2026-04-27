import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { Consultor, UnauthorizedError, NotFoundError, ValidationError } from '../types';
import { generateToken } from '../middleware/auth';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

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

  /**
   * List all consultants (without sensitive data)
   */
  async listConsultores(): Promise<Partial<Consultor>[]> {
    try {
      const pool = await getDatabase();
      const [rows] = await pool.execute(
        `SELECT id, nombre, apellido, email, especialidad, activo, created_at
         FROM CONSULTORES ORDER BY created_at DESC`
      );
      return (Array.isArray(rows) ? rows : []) as Partial<Consultor>[];
    } catch (error) {
      logger.error('Error listing consultores:', error);
      throw error;
    }
  }

  /**
   * Register a new consultant
   */
  async registerConsultor(data: {
    nombre: string;
    apellido?: string;
    email: string;
    password: string;
    especialidad?: string;
  }): Promise<Partial<Consultor>> {
    try {
      const pool = await getDatabase();

      // Check if email already exists
      const [existing] = await pool.execute(
        'SELECT id FROM CONSULTORES WHERE email = ?',
        [data.email.trim().toLowerCase()]
      );
      if (Array.isArray(existing) && existing.length > 0) {
        throw new ValidationError('Ya existe un consultor con ese correo', {
          email: 'Email duplicado',
        });
      }

      const id = uuidv4();
      const hash = await bcrypt.hash(data.password, 12);

      await pool.execute(
        `INSERT INTO CONSULTORES (id, nombre, apellido, email, password_hash, especialidad, activo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
        [
          id,
          data.nombre.trim(),
          data.apellido?.trim() || null,
          data.email.trim().toLowerCase(),
          hash,
          data.especialidad?.trim() || null,
        ]
      );

      logger.info(`New consultant registered: ${data.email}`);

      return {
        id,
        nombre: data.nombre,
        apellido: data.apellido,
        email: data.email.trim().toLowerCase(),
        especialidad: data.especialidad,
        activo: true,
      };
    } catch (error) {
      logger.error('Error registering consultor:', error);
      throw error;
    }
  }

  /**
   * Activate or deactivate a consultant
   */
  async toggleConsultorActivo(id: string, activo: boolean): Promise<Partial<Consultor>> {
    try {
      const pool = await getDatabase();
      await pool.execute('UPDATE CONSULTORES SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
      logger.info(`Consultant ${id} activo set to ${activo}`);
      return this.getProfile(id);
    } catch (error) {
      logger.error('Error toggling consultor activo:', error);
      throw error;
    }
  }

  /**
   * Change a consultant's password
   */
  async changeConsultorPassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      if (!newPassword || newPassword.length < 6) {
        throw new ValidationError('La nueva contraseña debe tener al menos 6 caracteres', {
          newPassword: 'Mínimo 6 caracteres',
        });
      }
      const pool = await getDatabase();
      const [rows] = await pool.execute('SELECT password_hash FROM CONSULTORES WHERE id = ?', [id]);
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('Consultor no encontrado', { id: 'No existe' });
      }
      const stored = (rows[0] as any).password_hash as string;
      const matches = await bcrypt.compare(currentPassword, stored);
      if (!matches) {
        throw new ValidationError('La contraseña actual no es correcta', {
          currentPassword: 'Inválida',
        });
      }
      const hash = await bcrypt.hash(newPassword, 12);
      await pool.execute('UPDATE CONSULTORES SET password_hash = ? WHERE id = ?', [hash, id]);
      logger.info(`Consultant ${id} changed password`);
    } catch (error) {
      logger.error('Error changing consultor password:', error);
      throw error;
    }
  }

  /**
   * Delete a consultant
   */
  async deleteConsultor(id: string): Promise<void> {
    try {
      const pool = await getDatabase();
      await pool.execute('DELETE FROM CONSULTORES WHERE id = ?', [id]);
      logger.info(`Consultant ${id} deleted`);
    } catch (error) {
      logger.error('Error deleting consultor:', error);
      throw error;
    }
  }
}

export const authController = new AuthController();

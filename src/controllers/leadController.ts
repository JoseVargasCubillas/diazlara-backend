import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { LeadSubmissionRequest, Cliente, ConflictError, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';

class LeadController {
  async createLead(leadData: LeadSubmissionRequest): Promise<Partial<Cliente>> {
    try {
      const pool = await getDatabase();

      // Validate email format
      if (!this.isValidEmail(leadData.email)) {
        throw new ValidationError('Invalid email format', { email: 'Invalid email format' });
      }

      // Validate phone format if provided
      if (leadData.telefono_whatsapp && !this.isValidPhone(leadData.telefono_whatsapp)) {
        throw new ValidationError('Invalid phone format', { phone: 'Phone must be in format: 5212345678' });
      }

      // Check if email already exists
      const [existingRows] = await pool.execute(
        'SELECT id FROM CLIENTES WHERE email = ?',
        [leadData.email]
      );

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        throw new ConflictError('Email already exists in the system', {
          clientId: (existingRows[0] as any).id,
        });
      }

      // Create new client
      const clientId = uuidv4();
      const origen = leadData.origen || 'web';

      await pool.execute(
        `INSERT INTO CLIENTES (id, nombre, apellido, email, telefono_whatsapp, empresa, puesto, origen, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          clientId,
          leadData.nombre,
          leadData.apellido || null,
          leadData.email,
          leadData.telefono_whatsapp || null,
          leadData.empresa || null,
          leadData.puesto || null,
          origen,
        ]
      );

      logger.info(`New lead created: ${clientId} (${leadData.email})`);

      return {
        id: clientId,
        nombre: leadData.nombre,
        email: leadData.email,
        created_at: new Date(),
      };
    } catch (error) {
      logger.error('Error creating lead:', error);
      throw error;
    }
  }

  async getLead(clientId: string): Promise<Cliente | null> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        'SELECT * FROM CLIENTES WHERE id = ?',
        [clientId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0] as Cliente;
      }

      return null;
    } catch (error) {
      logger.error('Error retrieving lead:', error);
      throw error;
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    // México phone format: 5212345678 (10 digits, starting with 52)
    const phoneRegex = /^52\d{10}$/;
    return phoneRegex.test(phone);
  }
}

export const leadController = new LeadController();

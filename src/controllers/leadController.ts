import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { LeadSubmissionRequest, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface LeadWaitingResponse {
  id: string;
  nombre: string;
  email: string;
  estado: string;
  created_at: Date;
  mensaje: string;
}

class LeadController {
  async createLead(leadData: LeadSubmissionRequest): Promise<LeadWaitingResponse> {
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

      // Check if email already exists in waiting list
      const [existingRows] = await pool.execute(
        'SELECT id FROM LEADS_EN_ESPERA WHERE email = ? AND estado IN ("pendiente", "aprobado")',
        [leadData.email]
      );

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        throw new ValidationError('Email already registered in waiting list', {
          email: 'Este email ya está en nuestra lista de espera',
        });
      }

      // Create new lead in waiting list
      const leadId = uuidv4();
      const origen = leadData.origen || 'web';
      const servicios = JSON.stringify(leadData.servicios || []);

      await pool.execute(
        `INSERT INTO LEADS_EN_ESPERA (id, nombre, email, telefono_whatsapp, empresa, puesto, servicios, estado, origen, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, NOW())`,
        [
          leadId,
          leadData.nombre,
          leadData.email,
          leadData.telefono_whatsapp || null,
          leadData.empresa || null,
          leadData.puesto || null,
          servicios,
          origen,
        ]
      );

      logger.info(`New lead in waiting list: ${leadId} (${leadData.email})`);

      return {
        id: leadId,
        nombre: leadData.nombre,
        email: leadData.email,
        estado: 'pendiente',
        created_at: new Date(),
        mensaje: 'Tu solicitud ha sido recibida. Un asesor se pondrá en contacto contigo pronto.',
      };
    } catch (error) {
      logger.error('Error creating lead:', error);
      throw error;
    }
  }

  async getLeadFromWaitingList(leadId: string) {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        'SELECT * FROM LEADS_EN_ESPERA WHERE id = ?',
        [leadId]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0];
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


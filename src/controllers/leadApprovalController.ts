import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ApproveLeadRequest {
  leadId: string;
  consultorId?: string;
  servicios?: string[];
}

interface RejectLeadRequest {
  leadId: string;
  motivo?: string;
}

interface SendZoomLinkRequest {
  leadId: string;
  zoomLink: string;
}

class LeadApprovalController {
  async listWaitingLeads(estado: string = 'pendiente', limit: number = 50) {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT
          id, nombre, email, telefono_whatsapp, empresa, puesto,
          servicios, estado, consultor_id, zoom_link, created_at, updated_at
         FROM LEADS_EN_ESPERA
         WHERE estado = ?
         ORDER BY created_at ASC
         LIMIT ?`,
        [estado, limit]
      );

      return rows || [];
    } catch (error) {
      logger.error('Error listing waiting leads:', error);
      throw error;
    }
  }

  async approveLead(data: ApproveLeadRequest) {
    try {
      const pool = await getDatabase();

      // Get the lead
      const [leadRows] = await pool.execute(
        'SELECT * FROM LEADS_EN_ESPERA WHERE id = ?',
        [data.leadId]
      );

      if (!Array.isArray(leadRows) || leadRows.length === 0) {
        throw new ValidationError('Lead not found', { leadId: 'Lead does not exist' });
      }

      // Update lead status to approved
      await pool.execute(
        `UPDATE LEADS_EN_ESPERA
         SET estado = 'aprobado', consultor_id = ?, fecha_aprovado = NOW()
         WHERE id = ?`,
        [data.consultorId || null, data.leadId]
      );

      logger.info(`Lead approved: ${data.leadId}`);

      return {
        id: data.leadId,
        estado: 'aprobado',
        mensaje: 'Lead aprobado. Puedes enviar el link de Zoom cuando esté listo.',
      };
    } catch (error) {
      logger.error('Error approving lead:', error);
      throw error;
    }
  }

  async rejectLead(data: RejectLeadRequest) {
    try {
      const pool = await getDatabase();

      // Get the lead
      const [leadRows] = await pool.execute(
        'SELECT * FROM LEADS_EN_ESPERA WHERE id = ?',
        [data.leadId]
      );

      if (!Array.isArray(leadRows) || leadRows.length === 0) {
        throw new ValidationError('Lead not found', { leadId: 'Lead does not exist' });
      }

      // Update lead status to rejected
      await pool.execute(
        `UPDATE LEADS_EN_ESPERA
         SET estado = 'rechazado', notas_interno = ?, fecha_rechazo = NOW()
         WHERE id = ?`,
        [data.motivo || null, data.leadId]
      );

      logger.info(`Lead rejected: ${data.leadId}`);

      return {
        id: data.leadId,
        estado: 'rechazado',
        mensaje: 'Lead rechazado.',
      };
    } catch (error) {
      logger.error('Error rejecting lead:', error);
      throw error;
    }
  }

  async sendZoomLink(data: SendZoomLinkRequest) {
    try {
      const pool = await getDatabase();

      // Validate zoom link format
      if (!data.zoomLink || !data.zoomLink.includes('zoom.us')) {
        throw new ValidationError('Invalid Zoom link', {
          zoomLink: 'El link debe ser una URL válida de Zoom',
        });
      }

      // Get the lead
      const [leadRows] = await pool.execute(
        'SELECT * FROM LEADS_EN_ESPERA WHERE id = ?',
        [data.leadId]
      );

      if (!Array.isArray(leadRows) || leadRows.length === 0) {
        throw new ValidationError('Lead not found', { leadId: 'Lead does not exist' });
      }

      const lead = leadRows[0] as any;

      if (lead.estado !== 'aprobado') {
        throw new ValidationError(
          'Can only send Zoom link to approved leads',
          { estado: 'El lead debe estar aprobado' }
        );
      }

      // Update zoom link
      await pool.execute(
        `UPDATE LEADS_EN_ESPERA
         SET zoom_link = ?, updated_at = NOW()
         WHERE id = ?`,
        [data.zoomLink, data.leadId]
      );

      logger.info(`Zoom link sent to lead: ${data.leadId}`);

      return {
        id: data.leadId,
        zoom_link: data.zoomLink,
        mensaje: 'Link de Zoom enviado al cliente.',
      };
    } catch (error) {
      logger.error('Error sending Zoom link:', error);
      throw error;
    }
  }

  async convertApprovedLeadToClient(leadId: string) {
    try {
      const pool = await getDatabase();

      // Get the approved lead
      const [leadRows] = await pool.execute(
        'SELECT * FROM LEADS_EN_ESPERA WHERE id = ? AND estado = "aprobado"',
        [leadId]
      );

      if (!Array.isArray(leadRows) || leadRows.length === 0) {
        throw new ValidationError('Lead not found or not approved', {
          leadId: 'Lead does not exist or is not approved',
        });
      }

      const lead = leadRows[0] as any;

      // Check if client already exists
      const [existingClient] = await pool.execute(
        'SELECT id FROM CLIENTES WHERE email = ?',
        [lead.email]
      );

      let clientId: string;

      if (Array.isArray(existingClient) && existingClient.length > 0) {
        clientId = (existingClient[0] as any).id;
        logger.info(`Client already exists: ${clientId}`);
      } else {
        // Create new client from lead
        clientId = uuidv4();

        await pool.execute(
          `INSERT INTO CLIENTES (id, nombre, email, telefono_whatsapp, empresa, puesto, origen, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            clientId,
            lead.nombre,
            lead.email,
            lead.telefono_whatsapp || null,
            lead.empresa || null,
            lead.puesto || null,
            lead.origen || 'web',
          ]
        );

        logger.info(`New client created from lead: ${clientId}`);
      }

      return {
        clientId,
        leadId,
        mensaje: 'Lead convertido a cliente.',
      };
    } catch (error) {
      logger.error('Error converting lead to client:', error);
      throw error;
    }
  }
}

export const leadApprovalController = new LeadApprovalController();

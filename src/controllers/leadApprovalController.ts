import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { LeadSessionAssignmentRequest, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { consultoriaIntegrationService } from '../services/ConsultoriaIntegrationService';
import { appointmentController } from './appointmentController';

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
  async listWaitingLeads(estado: string = 'pendiente', limit: number = 50, estatusComercial?: string) {
    try {
      const pool = await getDatabase();
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 50;

      let query = `SELECT
          l.id, l.nombre, l.email, l.telefono_whatsapp, l.empresa, l.puesto,
          l.servicios, l.estado, l.estatus_comercial, l.consultor_id, l.zoom_link,
          l.consultoria_cliente_id, l.created_at, l.updated_at,
          c.id            AS cita_id,
          c.fecha_hora_inicio AS cita_fecha_hora_inicio,
          c.fecha_hora_fin   AS cita_fecha_hora_fin,
          c.meet_link        AS cita_meet_link,
          c.estado           AS cita_estado,
          c.notas_cliente    AS cita_notas_cliente,
          cons.nombre        AS consultor_nombre,
          cons.apellido      AS consultor_apellido,
          cons.email         AS consultor_email
         FROM LEADS_EN_ESPERA l
         LEFT JOIN CLIENTES cli ON cli.email = l.email
         LEFT JOIN CITAS c ON c.id = (
           SELECT c2.id FROM CITAS c2
           WHERE c2.cliente_id = cli.id
             AND (l.consultor_id IS NULL OR c2.consultor_id = l.consultor_id)
             AND c2.estado IN ('pendiente', 'confirmada', 'completada')
           ORDER BY c2.fecha_hora_inicio DESC
           LIMIT 1
         )
         LEFT JOIN CONSULTORES cons ON cons.id = l.consultor_id
         WHERE l.estado = ?`;
      const params: Array<string | number> = [estado];

      if (estatusComercial) {
        query += ' AND l.estatus_comercial = ?';
        params.push(estatusComercial);
      }

      query += ` ORDER BY l.created_at ASC LIMIT ${safeLimit}`;

      const [rows] = await pool.execute(query, params);

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

      const lead = leadRows[0] as any;

      // Update lead status to approved
      await pool.execute(
        `UPDATE LEADS_EN_ESPERA
         SET estado = 'aprobado', consultor_id = ?, fecha_aprovado = NOW(), estatus_comercial = COALESCE(estatus_comercial, 'interesado')
         WHERE id = ?`,
        [data.consultorId || null, data.leadId]
      );

      logger.info(`Lead approved: ${data.leadId}`);

      // Sync with Consultoria - create cliente there
      let syncResult = null;
      try {
        syncResult = await consultoriaIntegrationService.syncLeadToConsultoria({
          leadId: data.leadId,
          nombre: lead.nombre,
          email: lead.email,
          telefono_whatsapp: lead.telefono_whatsapp,
          empresa: lead.empresa,
          puesto: lead.puesto,
          servicios: lead.servicios ? JSON.parse(lead.servicios) : [],
          consultorId: data.consultorId,
        });

        // Store Consultoria cliente ID for reference
        await pool.execute(
          `UPDATE LEADS_EN_ESPERA
           SET consultoria_cliente_id = ?
           WHERE id = ?`,
          [syncResult.clienteId, data.leadId]
        );

        logger.info(`Lead synced to Consultoria: ${data.leadId} -> Cliente ${syncResult.clienteId}`);
      } catch (syncError) {
        logger.error(`Warning: Could not sync lead to Consultoria: ${data.leadId}`, syncError);
        // Continue anyway - don't block approval if sync fails
      }

      return {
        id: data.leadId,
        estado: 'aprobado',
        consultoriaClienteId: syncResult?.clienteId,
        mensaje: syncResult
          ? 'Lead aprobado y sincronizado con Consultoria. Puedes enviar el link de Zoom.'
          : 'Lead aprobado. Puedes enviar el link de Zoom cuando esté listo.',
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

      const clientId = await this.ensureClientFromLead(lead);

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

  async assignSessionToLead(leadId: string, data: LeadSessionAssignmentRequest) {
    try {
      const pool = await getDatabase();

      const [leadRows] = await pool.execute(
        'SELECT * FROM LEADS_EN_ESPERA WHERE id = ?',
        [leadId]
      );

      if (!Array.isArray(leadRows) || leadRows.length === 0) {
        throw new ValidationError('Lead not found', { leadId: 'Lead does not exist' });
      }

      const lead = leadRows[0] as any;

      if (lead.estado === 'rechazado') {
        throw new ValidationError('Rejected leads cannot be scheduled', {
          estado: 'El lead fue rechazado y no puede agendarse',
        });
      }

      const clientId = await this.ensureClientFromLead(lead);
      const startTime = new Date(data.fecha_hora_inicio);
      const endTime = data.fecha_hora_fin
        ? new Date(data.fecha_hora_fin)
        : new Date(startTime.getTime() + (15 * 60 * 1000));

      // If this lead/cliente already has pending/confirmed citas (with ANY consultor),
      // cancel them so reschedules don't trigger slot conflicts.
      await pool.execute(
        `UPDATE CITAS
         SET estado = 'cancelada'
         WHERE cliente_id = ?
           AND estado IN ('pendiente', 'confirmada')`,
        [clientId]
      );

      const appointment = await appointmentController.createAppointment(clientId, {
        cliente_id: clientId,
        consultor_id: data.consultor_id,
        fecha_hora_inicio: startTime.toISOString(),
        fecha_hora_fin: endTime.toISOString(),
        notas_cliente: data.notas_cliente,
      });

      const estatusComercial = data.estatus_comercial || 'prospecto';

      await pool.execute(
        `UPDATE LEADS_EN_ESPERA
         SET estado = 'sesion_agendada',
             consultor_id = ?,
             fecha_aprovado = COALESCE(fecha_aprovado, NOW()),
             estatus_comercial = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [data.consultor_id, estatusComercial, leadId]
      );

      await pool.execute(
        `UPDATE CLIENTES
         SET estatus_comercial = ?
         WHERE id = ?`,
        [estatusComercial, clientId]
      );

      logger.info(`Manual session assigned to lead: ${leadId} -> appointment ${appointment.id}`);

      return {
        leadId,
        clientId,
        appointmentId: appointment.id,
        estado: 'sesion_agendada',
        estatus_comercial: estatusComercial,
        appointment,
        mensaje: 'Sesión asignada correctamente al lead.',
      };
    } catch (error) {
      logger.error('Error assigning session to lead:', error);
      throw error;
    }
  }

  private async ensureClientFromLead(lead: any): Promise<string> {
    const pool = await getDatabase();

    const [existingClient] = await pool.execute(
      'SELECT id FROM CLIENTES WHERE email = ?',
      [lead.email]
    );

    if (Array.isArray(existingClient) && existingClient.length > 0) {
      const clientId = (existingClient[0] as any).id;
      logger.info(`Client already exists: ${clientId}`);
      return clientId;
    }

    const clientId = uuidv4();

    await pool.execute(
      `INSERT INTO CLIENTES (id, nombre, email, telefono_whatsapp, empresa, puesto, origen, estatus_comercial, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        clientId,
        lead.nombre,
        lead.email,
        lead.telefono_whatsapp || null,
        lead.empresa || null,
        lead.puesto || null,
        lead.origen || 'web',
        lead.estatus_comercial || 'interesado',
      ]
    );

    logger.info(`New client created from lead: ${clientId}`);
    return clientId;
  }
}

export const leadApprovalController = new LeadApprovalController();

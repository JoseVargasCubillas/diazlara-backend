import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { LeadSessionAssignmentRequest, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { consultoriaIntegrationService } from '../services/ConsultoriaIntegrationService';
import { appointmentController } from './appointmentController';

const HISTORICO_CLIENTE_ETIQUETAS = [
  'cliente_removido',
  'reprogramado',
  'no_entro_sesion',
  'cancelado',
  'duplicado',
  'otro',
] as const;

type HistoricoClienteEtiqueta = typeof HISTORICO_CLIENTE_ETIQUETAS[number];

interface ApproveLeadRequest {
  leadId: string;
  consultorId?: string;
  servicios?: string[];
}

interface RejectLeadRequest {
  leadId: string;
  motivo?: string;
}

interface SendMeetLinkRequest {
  leadId: string;
  meetLink: string;
}

interface ArchiveLeadRequest {
  etiqueta?: string;
  motivo?: string;
  archivedBy?: string;
}

interface ManualClientRequest {
  nombre: string;
  apellido?: string;
  email: string;
  telefono_whatsapp?: string;
  empresa?: string;
  puesto?: string;
  servicios?: string[];
  fuente_registro?: string;
  estatus_comercial?: string;
  notas?: string;
  consultor_id?: string;
}

class LeadApprovalController {
  async listWaitingLeads(estado: string = 'pendiente', limit: number = 50, estatusComercial?: string) {
    try {
      const pool = await getDatabase();
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 50;

      let query = `SELECT
          l.id, l.nombre, l.email, l.telefono_whatsapp, l.empresa, l.puesto,
          l.servicios, l.estado, l.estatus_comercial, l.consultor_id, l.meet_link,
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
          ? 'Lead aprobado y sincronizado con Consultoria. Puedes enviar el link de Google Meet.'
          : 'Lead aprobado. Puedes enviar el link de Google Meet cuando esté listo.',
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

  async sendMeetLink(data: SendMeetLinkRequest) {
    try {
      const pool = await getDatabase();

      // Validate Google Meet link format
      const meetLink = (data.meetLink || '').trim();
      const isValidMeetUrl = /^https?:\/\/(meet\.google\.com|g\.co\/meet)\//i.test(meetLink);
      if (!meetLink || !isValidMeetUrl) {
        throw new ValidationError('Invalid Google Meet link', {
          meetLink: 'El link debe ser una URL válida de Google Meet (https://meet.google.com/...)',
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
          'Can only send Google Meet link to approved leads',
          { estado: 'El lead debe estar aprobado' }
        );
      }

      // Update meet link
      await pool.execute(
        `UPDATE LEADS_EN_ESPERA
         SET meet_link = ?, updated_at = NOW()
         WHERE id = ?`,
        [meetLink, data.leadId]
      );

      // Best-effort sync with Consultoria platform
      if (lead.consultoria_cliente_id) {
        try {
          await consultoriaIntegrationService.sendMeetLinkToConsultoria(
            lead.consultoria_cliente_id,
            meetLink
          );
        } catch (syncError) {
          logger.warn(
            `Could not propagate Google Meet link to Consultoria for lead ${data.leadId}:`,
            syncError
          );
        }
      }

      logger.info(`Google Meet link sent to lead: ${data.leadId}`);

      return {
        id: data.leadId,
        meet_link: meetLink,
        mensaje: 'Link de Google Meet enviado al cliente.',
      };
    } catch (error) {
      logger.error('Error sending Google Meet link:', error);
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

  async archiveLeadToHistory(leadId: string, data: ArchiveLeadRequest = {}) {
    const pool = await getDatabase();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [leadRows] = await connection.execute(
        'SELECT * FROM LEADS_EN_ESPERA WHERE id = ?',
        [leadId]
      );

      if (!Array.isArray(leadRows) || leadRows.length === 0) {
        throw new ValidationError('Lead not found', { leadId: 'Lead does not exist' });
      }

      const lead = leadRows[0] as any;
      const etiqueta = this.normalizeHistoricoEtiqueta(data.etiqueta);

      const [clientRows] = await connection.execute(
        'SELECT * FROM CLIENTES WHERE email = ? LIMIT 1',
        [lead.email]
      );
      const cliente = Array.isArray(clientRows) && clientRows.length > 0 ? clientRows[0] as any : null;

      let cita: any = null;
      if (cliente) {
        const [citaRows] = await connection.execute(
          `SELECT * FROM CITAS
           WHERE cliente_id = ?
           ORDER BY fecha_hora_inicio DESC, created_at DESC
           LIMIT 1`,
          [cliente.id]
        );
        cita = Array.isArray(citaRows) && citaRows.length > 0 ? citaRows[0] as any : null;
      }

      const historicoId = uuidv4();
      await connection.execute(
        `INSERT INTO HISTORICO_CLIENTES (
           id, lead_id, cliente_manual_id, cliente_id, cita_id, consultor_id,
           tipo_origen, fuente_registro, nombre, email, telefono_whatsapp,
           empresa, puesto, servicios, etiqueta, motivo, estado_lead, estado_cita,
           estatus_comercial, meet_link, fecha_hora_inicio, fecha_hora_fin,
           archived_by, archived_at, lead_snapshot, cliente_manual_snapshot, cliente_snapshot, cita_snapshot
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
        [
          historicoId,
          lead.id,
          null,
          cliente?.id || null,
          cita?.id || null,
          lead.consultor_id || cita?.consultor_id || null,
          'organico',
          lead.origen || 'web',
          lead.nombre,
          lead.email,
          lead.telefono_whatsapp || cliente?.telefono_whatsapp || null,
          lead.empresa || cliente?.empresa || null,
          lead.puesto || cliente?.puesto || null,
          this.toJsonOrNull(lead.servicios),
          etiqueta,
          data.motivo ? String(data.motivo).trim() : null,
          lead.estado || null,
          cita?.estado || null,
          lead.estatus_comercial || cliente?.estatus_comercial || null,
          cita?.meet_link || lead.meet_link || null,
          cita?.fecha_hora_inicio || null,
          cita?.fecha_hora_fin || null,
          data.archivedBy || null,
          JSON.stringify(lead),
          null,
          cliente ? JSON.stringify(cliente) : null,
          cita ? JSON.stringify(cita) : null,
        ]
      );

      await connection.execute('DELETE FROM LEADS_EN_ESPERA WHERE id = ?', [leadId]);
      const [clientDeleteResult] = await connection.execute(
        'DELETE FROM CLIENTES WHERE email = ?',
        [lead.email]
      );

      await connection.commit();

      const deletedClients = Number((clientDeleteResult as any).affectedRows || 0);
      logger.info(`Lead archived: ${leadId}; history=${historicoId}; related clients removed from active tables: ${deletedClients}`);

      return {
        historicoId,
        leadId,
        email: lead.email,
        etiqueta,
        deletedClients,
        mensaje: deletedClients > 0
          ? 'Cliente movido al historico y removido de tablas activas.'
          : 'Lead movido al historico. No habia cliente relacionado.',
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error archiving lead to history:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async listClientHistory(limit: number = 50, etiqueta?: string) {
    try {
      const pool = await getDatabase();
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 50;
      const params: Array<string | number> = [];
      let query = `SELECT
          id, lead_id, cliente_id, cita_id, nombre, email, telefono_whatsapp,
          cliente_manual_id, consultor_id, tipo_origen, fuente_registro,
          empresa, puesto, servicios, etiqueta, motivo, estado_lead, estado_cita,
          estatus_comercial, meet_link, fecha_hora_inicio, fecha_hora_fin,
          archived_by, archived_at
        FROM HISTORICO_CLIENTES`;

      if (etiqueta) {
        query += ' WHERE etiqueta = ?';
        params.push(this.normalizeHistoricoEtiqueta(etiqueta));
      }

      query += ` ORDER BY archived_at DESC LIMIT ${safeLimit}`;

      const [rows] = await pool.execute(query, params);
      return rows || [];
    } catch (error) {
      logger.error('Error listing client history:', error);
      throw error;
    }
  }

  private normalizeHistoricoEtiqueta(etiqueta?: string): HistoricoClienteEtiqueta {
    if (etiqueta && HISTORICO_CLIENTE_ETIQUETAS.includes(etiqueta as HistoricoClienteEtiqueta)) {
      return etiqueta as HistoricoClienteEtiqueta;
    }

    return 'cliente_removido';
  }

  private toJsonOrNull(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return value;
      } catch {
        return JSON.stringify([value]);
      }
    }

    return JSON.stringify(value);
  }

  async createManualClient(data: ManualClientRequest, currentConsultorId: string, isSuperAdmin: boolean = false) {
    try {
      const pool = await getDatabase();
      const consultorId = isSuperAdmin && data.consultor_id ? data.consultor_id : currentConsultorId;
      const clientId = uuidv4();

      if (!data.nombre || !data.email) {
        throw new ValidationError('nombre and email are required', {
          nombre: !data.nombre ? 'Required' : '',
          email: !data.email ? 'Required' : '',
        });
      }

      await pool.execute(
        `INSERT INTO CLIENTES_CONSULTOR (
           id, consultor_id, nombre, apellido, email, telefono_whatsapp, empresa,
           puesto, servicios, fuente_registro, estatus_comercial, notas, created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clientId,
          consultorId,
          String(data.nombre).trim(),
          data.apellido ? String(data.apellido).trim() : null,
          String(data.email).trim(),
          data.telefono_whatsapp ? String(data.telefono_whatsapp).trim() : null,
          data.empresa ? String(data.empresa).trim() : null,
          data.puesto ? String(data.puesto).trim() : null,
          this.toJsonOrNull(data.servicios || []),
          data.fuente_registro ? String(data.fuente_registro).trim() : 'manual_consultor',
          data.estatus_comercial ? String(data.estatus_comercial).trim() : 'prospecto',
          data.notas ? String(data.notas).trim() : null,
          currentConsultorId,
        ]
      );

      logger.info(`Manual consultant client created: ${clientId} by ${currentConsultorId}`);

      return { id: clientId, consultor_id: consultorId, ...data };
    } catch (error) {
      logger.error('Error creating manual client:', error);
      throw error;
    }
  }

  async listManualClients(currentConsultorId: string, isSuperAdmin: boolean = false, limit: number = 50) {
    try {
      const pool = await getDatabase();
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 50;
      const params: string[] = [];
      let query = `SELECT
          cc.*, c.nombre AS consultor_nombre, c.apellido AS consultor_apellido, c.email AS consultor_email
        FROM CLIENTES_CONSULTOR cc
        JOIN CONSULTORES c ON c.id = cc.consultor_id
        WHERE cc.activo = 1`;

      if (!isSuperAdmin) {
        query += ' AND cc.consultor_id = ?';
        params.push(currentConsultorId);
      }

      query += ` ORDER BY cc.created_at DESC LIMIT ${safeLimit}`;

      const [rows] = await pool.execute(query, params);
      return rows || [];
    } catch (error) {
      logger.error('Error listing manual clients:', error);
      throw error;
    }
  }

  async archiveManualClient(clientId: string, data: ArchiveLeadRequest = {}) {
    const pool = await getDatabase();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [clientRows] = await connection.execute(
        'SELECT * FROM CLIENTES_CONSULTOR WHERE id = ? AND activo = 1',
        [clientId]
      );

      if (!Array.isArray(clientRows) || clientRows.length === 0) {
        throw new ValidationError('Manual client not found', { clientId: 'Client does not exist' });
      }

      const manualClient = clientRows[0] as any;
      const etiqueta = this.normalizeHistoricoEtiqueta(data.etiqueta);
      const historicoId = uuidv4();

      await connection.execute(
        `INSERT INTO HISTORICO_CLIENTES (
           id, lead_id, cliente_manual_id, cliente_id, cita_id, consultor_id,
           tipo_origen, fuente_registro, nombre, email, telefono_whatsapp,
           empresa, puesto, servicios, etiqueta, motivo, estado_lead, estado_cita,
           estatus_comercial, meet_link, fecha_hora_inicio, fecha_hora_fin,
           archived_by, archived_at, lead_snapshot, cliente_manual_snapshot, cliente_snapshot, cita_snapshot
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
        [
          historicoId,
          null,
          manualClient.id,
          null,
          null,
          manualClient.consultor_id,
          'no_organico',
          manualClient.fuente_registro || 'manual_consultor',
          manualClient.nombre,
          manualClient.email,
          manualClient.telefono_whatsapp || null,
          manualClient.empresa || null,
          manualClient.puesto || null,
          this.toJsonOrNull(manualClient.servicios),
          etiqueta,
          data.motivo ? String(data.motivo).trim() : null,
          'manual',
          null,
          manualClient.estatus_comercial || null,
          null,
          null,
          null,
          data.archivedBy || null,
          null,
          JSON.stringify(manualClient),
          null,
          null,
        ]
      );

      await connection.execute('UPDATE CLIENTES_CONSULTOR SET activo = 0 WHERE id = ?', [clientId]);
      await connection.commit();

      logger.info(`Manual client archived: ${clientId}; history=${historicoId}`);

      return {
        historicoId,
        clienteManualId: clientId,
        email: manualClient.email,
        etiqueta,
        mensaje: 'Cliente manual movido al historico.',
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error archiving manual client:', error);
      throw error;
    } finally {
      connection.release();
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

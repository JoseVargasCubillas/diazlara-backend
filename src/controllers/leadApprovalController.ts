import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { LeadSessionAssignmentRequest, ValidationError } from '../types';
import { Request } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { consultoriaIntegrationService } from '../services/ConsultoriaIntegrationService';
import { appointmentController } from './appointmentController';
import { CLIENT_STATUS_DEFAULT, CLIENT_STATUS_OPTIONS, ClientStatus, isClientStatus } from '../constants/clientStatus';
import { roundRobinService } from '../services/RoundRobinService';

const formidable = require('formidable');

const HISTORICO_CLIENTE_ETIQUETAS = [
  'cliente_removido',
  'reprogramado',
  'no_entro_sesion',
  'cancelado',
  'duplicado',
  'cliente_restaurado',
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
  no_cliente?: string;
  nombre: string;
  apellido?: string;
  email: string;
  telefono_whatsapp?: string;
  empresa?: string;
  asesor_comercial?: string;
  evento_previo?: string;
  puesto?: string;
  servicios?: string[];
  fuente_registro?: string;
  fecha_registro?: string;
  importe_total?: number | string;
  ene?: number | string;
  feb?: number | string;
  mar?: number | string;
  abr?: number | string;
  may?: number | string;
  jun?: number | string;
  jul?: number | string;
  ago?: number | string;
  sep?: number | string;
  oct?: number | string;
  nov?: number | string;
  dic?: number | string;
  saldo?: number | string;
  expediente?: string;
  fecha_sesion_1?: string;
  fecha_sesion_2?: string;
  sesiones?: string[];
  observaciones?: string;
  comentarios?: string;
  benchmark?: string;
  revision_financiera?: string;
  minuta?: string;
  candidato?: string;
  ct?: string;
  comentarios_ct?: string;
  status?: string;
  client_status?: ClientStatus;
  factura_1?: string;
  drive_1?: string;
  factura_2?: string;
  drive_2?: string;
  estatus_comercial?: string;
  notas?: string;
  consultor_id?: string;
}

interface ClientConsultantAssignmentRequest {
  consultor_id: string;
  servicio_id?: string;
  servicio_nombre?: string;
  etapa?: string;
  notas?: string;
}

const MANUAL_CLIENT_MUTABLE_FIELDS = [
  'no_cliente',
  'nombre',
  'apellido',
  'email',
  'telefono_whatsapp',
  'empresa',
  'asesor_comercial',
  'evento_previo',
  'puesto',
  'servicios',
  'fuente_registro',
  'fecha_registro',
  'importe_total',
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
  'saldo',
  'expediente',
  'fecha_sesion_1',
  'fecha_sesion_2',
  'sesiones',
  'observaciones',
  'comentarios',
  'benchmark',
  'revision_financiera',
  'minuta',
  'candidato',
  'ct',
  'comentarios_ct',
  'status',
  'client_status',
  'factura_1',
  'drive_1',
  'factura_2',
  'drive_2',
  'estatus_comercial',
  'notas',
] as const;

const MONEY_FIELDS = new Set([
  'importe_total',
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
  'saldo',
]);

class LeadApprovalController {
  async listWaitingLeads(
    estado: string = 'pendiente',
    limit: number = 50,
    estatusComercial?: string,
    currentConsultorId?: string,
    isSuperAdmin: boolean = false
  ) {
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
             AND c2.estado IN ('pendiente', 'agendada', 'confirmada', 'completada')
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

      if (!isSuperAdmin && currentConsultorId) {
        query += ' AND l.consultor_id = ?';
        params.push(currentConsultorId);
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
      let approvedConsultorId = lead.consultor_id || null;

      if (!approvedConsultorId && data.consultorId) {
        approvedConsultorId = await roundRobinService.isAgendaRoundRobinConsultorId(data.consultorId)
          ? data.consultorId
          : null;
      }

      if (!approvedConsultorId) {
        approvedConsultorId = await roundRobinService.asignarConsultor(data.leadId);
      }

      // Update lead status to approved
      await pool.execute(
        `UPDATE LEADS_EN_ESPERA
         SET estado = 'aprobado', consultor_id = ?, fecha_aprovado = NOW(), estatus_comercial = COALESCE(estatus_comercial, 'interesado')
         WHERE id = ?`,
        [approvedConsultorId, data.leadId]
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
          consultorId: approvedConsultorId || undefined,
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

  async assignSessionToLead(
    leadId: string,
    data: LeadSessionAssignmentRequest,
    isSuperAdmin: boolean = false
  ) {
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

      const canScheduleAgendaLead = await roundRobinService.isAgendaRoundRobinConsultorId(data.consultor_id);
      if (!isSuperAdmin && !canScheduleAgendaLead) {
        throw new ValidationError('Consultor is not allowed to schedule organic agenda leads', {
          consultor_id: 'Solo Daniela, Jesus o un administrador pueden agendar citas de leads organicos',
        });
      }

      if (!isSuperAdmin && lead.consultor_id && lead.consultor_id !== data.consultor_id) {
        throw new ValidationError('Lead is assigned to another agenda consultant', {
          consultor_id: 'Este lead esta asignado a otro consultor de agenda',
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
           AND estado IN ('pendiente', 'agendada', 'confirmada')`,
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
          id, no_cliente, lead_id, cliente_id, cita_id, nombre, email, telefono_whatsapp,
          cliente_manual_id, consultor_id, tipo_origen, fuente_registro, fecha_registro,
          empresa, asesor_comercial, evento_previo, puesto, servicios, importe_total,
          ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov, dic, saldo,
          expediente, fecha_sesion_1, fecha_sesion_2, observaciones, comentarios,
          benchmark, revision_financiera, minuta, candidato, ct, comentarios_ct,
          status, client_status, factura_1, drive_1, factura_2, drive_2, etiqueta, motivo, estado_lead, estado_cita,
          estatus_comercial, meet_link, fecha_hora_inicio, fecha_hora_fin,
          archived_by, archived_at
        FROM HISTORICO_CLIENTES`;

      if (etiqueta) {
        query += ' WHERE etiqueta = ?';
        params.push(this.normalizeHistoricoEtiqueta(etiqueta));
      } else {
        query += " WHERE etiqueta <> 'cliente_restaurado'";
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

  private normalizeString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  }

  private normalizeMoney(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }

  private normalizeServices(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .map((item) => String(item).trim())
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  private normalizeSessions(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .map((item) => this.normalizeString(item))
      .filter((item): item is string => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  private normalizeManualClientValue(field: string, value: unknown) {
    if (field === 'client_status') {
      return this.normalizeClientStatus(value);
    }

    if (field === 'servicios') {
      return this.toJsonOrNull(this.normalizeServices(value));
    }

    if (field === 'sesiones') {
      return this.toJsonOrNull(this.normalizeSessions(value));
    }

    if (field === 'fuente_registro') {
      return this.normalizeString(value) || 'manual_consultor';
    }

    if (field === 'empresa') {
      return this.normalizeString(value) || 'NA';
    }

    if (MONEY_FIELDS.has(field)) {
      return this.normalizeMoney(value);
    }

    return this.normalizeString(value);
  }

  private normalizeClientStatus(value: unknown): ClientStatus {
    const cleanValue = this.normalizeString(value);

    if (!cleanValue) {
      return CLIENT_STATUS_DEFAULT;
    }

    if (!isClientStatus(cleanValue)) {
      throw new ValidationError('Invalid client status', {
        client_status: `El status debe ser uno de: ${CLIENT_STATUS_OPTIONS.join(', ')}`,
      });
    }

    return cleanValue;
  }

  private async syncServiceCatalog(pool: any, servicios: string[]) {
    for (const servicio of servicios) {
      await pool.execute(
        `INSERT INTO SERVICIOS_CLIENTE (nombre, activo)
         VALUES (?, 1)
         ON DUPLICATE KEY UPDATE activo = 1, updated_at = NOW()`,
        [servicio]
      );
    }
  }

  async listClientServices(includeInactive: boolean = false) {
    try {
      const pool = await getDatabase();
      const query = includeInactive
        ? 'SELECT id, nombre, activo, created_at, updated_at FROM SERVICIOS_CLIENTE ORDER BY nombre ASC'
        : 'SELECT id, nombre, activo, created_at, updated_at FROM SERVICIOS_CLIENTE WHERE activo = 1 ORDER BY nombre ASC';
      const [rows] = await pool.execute(query);
      return rows || [];
    } catch (error) {
      logger.error('Error listing client services:', error);
      throw error;
    }
  }

  async createClientService(nombre: string) {
    try {
      const pool = await getDatabase();
      const cleanName = this.normalizeString(nombre);

      if (!cleanName) {
        throw new ValidationError('nombre is required', { nombre: 'Required' });
      }

      await this.syncServiceCatalog(pool, [cleanName]);
      const [rows] = await pool.execute(
        'SELECT id, nombre, activo, created_at, updated_at FROM SERVICIOS_CLIENTE WHERE nombre = ? LIMIT 1',
        [cleanName]
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : { nombre: cleanName, activo: 1 };
    } catch (error) {
      logger.error('Error creating client service:', error);
      throw error;
    }
  }

  async listCommercialAdvisors(includeInactive: boolean = false) {
    try {
      const pool = await getDatabase();
      const query = includeInactive
        ? 'SELECT id, nombre, activo, created_at, updated_at FROM ASESORES_COMERCIALES ORDER BY nombre ASC'
        : 'SELECT id, nombre, activo, created_at, updated_at FROM ASESORES_COMERCIALES WHERE activo = 1 ORDER BY nombre ASC';
      const [rows] = await pool.execute(query);
      return rows || [];
    } catch (error) {
      logger.error('Error listing commercial advisors:', error);
      throw error;
    }
  }

  async createCommercialAdvisor(nombre: string) {
    try {
      const pool = await getDatabase();
      const cleanName = this.normalizeString(nombre);

      if (!cleanName) {
        throw new ValidationError('nombre is required', { nombre: 'Required' });
      }

      await pool.execute(
        `INSERT INTO ASESORES_COMERCIALES (nombre, activo)
         VALUES (?, 1)
         ON DUPLICATE KEY UPDATE activo = 1, updated_at = NOW()`,
        [cleanName]
      );

      const [rows] = await pool.execute(
        'SELECT id, nombre, activo, created_at, updated_at FROM ASESORES_COMERCIALES WHERE nombre = ? LIMIT 1',
        [cleanName]
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : { nombre: cleanName, activo: 1 };
    } catch (error) {
      logger.error('Error creating commercial advisor:', error);
      throw error;
    }
  }

  async listClientConsultantAssignments(clientId: string) {
    try {
      const pool = await getDatabase();
      await this.ensureManualClientExists(clientId, true);

      const [rows] = await pool.execute(
        `SELECT
           a.id, a.cliente_manual_id, a.consultor_id, a.servicio_id, a.etapa,
           a.notas, a.activo, a.created_by, a.created_at, a.updated_at,
           c.nombre AS consultor_nombre, c.apellido AS consultor_apellido, c.email AS consultor_email,
           s.nombre AS servicio_nombre
         FROM CLIENTE_CONSULTOR_ASIGNACIONES a
         JOIN CONSULTORES c ON c.id = a.consultor_id
         LEFT JOIN SERVICIOS_CLIENTE s ON s.id = a.servicio_id
         WHERE a.cliente_manual_id = ? AND a.activo = 1
         ORDER BY a.created_at DESC`,
        [clientId]
      );

      return rows || [];
    } catch (error) {
      logger.error('Error listing client consultant assignments:', error);
      throw error;
    }
  }

  async createClientConsultantAssignment(
    clientId: string,
    data: ClientConsultantAssignmentRequest,
    currentConsultorId: string
  ) {
    try {
      const pool = await getDatabase();
      await this.ensureManualClientExists(clientId, true);

      const consultorId = this.normalizeString(data.consultor_id);
      if (!consultorId) {
        throw new ValidationError('consultor_id is required', { consultor_id: 'Required' });
      }

      await this.ensureConsultorExists(consultorId);
      const servicioId = await this.resolveServiceId(pool, data.servicio_id, data.servicio_nombre);
      const assignmentId = uuidv4();

      await pool.execute(
        `INSERT INTO CLIENTE_CONSULTOR_ASIGNACIONES (
           id, cliente_manual_id, consultor_id, servicio_id, etapa, notas, created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          assignmentId,
          clientId,
          consultorId,
          servicioId,
          this.normalizeString(data.etapa) || this.normalizeString(data.servicio_nombre),
          this.normalizeString(data.notas),
          currentConsultorId,
        ]
      );

      const assignments = await this.listClientConsultantAssignments(clientId);
      return (assignments as any[]).find((item) => item.id === assignmentId) || { id: assignmentId };
    } catch (error) {
      logger.error('Error creating client consultant assignment:', error);
      throw error;
    }
  }

  async updateClientConsultantAssignment(
    clientId: string,
    assignmentId: string,
    data: Partial<ClientConsultantAssignmentRequest>
  ) {
    try {
      const pool = await getDatabase();
      await this.ensureManualClientExists(clientId, true);

      const assignments: string[] = [];
      const values: any[] = [];

      if (Object.prototype.hasOwnProperty.call(data, 'consultor_id')) {
        const consultorId = this.normalizeString(data.consultor_id);
        if (!consultorId) {
          throw new ValidationError('consultor_id is required', { consultor_id: 'Required' });
        }
        await this.ensureConsultorExists(consultorId);
        assignments.push('consultor_id = ?');
        values.push(consultorId);
      }

      if (
        Object.prototype.hasOwnProperty.call(data, 'servicio_id') ||
        Object.prototype.hasOwnProperty.call(data, 'servicio_nombre')
      ) {
        assignments.push('servicio_id = ?');
        values.push(await this.resolveServiceId(pool, data.servicio_id, data.servicio_nombre));
      }

      if (Object.prototype.hasOwnProperty.call(data, 'etapa')) {
        assignments.push('etapa = ?');
        values.push(this.normalizeString(data.etapa));
      }

      if (Object.prototype.hasOwnProperty.call(data, 'notas')) {
        assignments.push('notas = ?');
        values.push(this.normalizeString(data.notas));
      }

      if (assignments.length === 0) {
        const current = await this.listClientConsultantAssignments(clientId);
        return (current as any[]).find((item) => item.id === assignmentId) || { id: assignmentId };
      }

      values.push(clientId, assignmentId);
      await pool.execute(
        `UPDATE CLIENTE_CONSULTOR_ASIGNACIONES
         SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE cliente_manual_id = ? AND id = ? AND activo = 1`,
        values
      );

      const updated = await this.listClientConsultantAssignments(clientId);
      return (updated as any[]).find((item) => item.id === assignmentId) || { id: assignmentId };
    } catch (error) {
      logger.error('Error updating client consultant assignment:', error);
      throw error;
    }
  }

  async deleteClientConsultantAssignment(clientId: string, assignmentId: string) {
    try {
      const pool = await getDatabase();
      await this.ensureManualClientExists(clientId, true);
      await pool.execute(
        `UPDATE CLIENTE_CONSULTOR_ASIGNACIONES
         SET activo = 0, updated_at = NOW()
         WHERE cliente_manual_id = ? AND id = ?`,
        [clientId, assignmentId]
      );
      return { id: assignmentId, cliente_manual_id: clientId, activo: 0 };
    } catch (error) {
      logger.error('Error deleting client consultant assignment:', error);
      throw error;
    }
  }

  private getClientFilesRoot(): string {
    return path.resolve(process.env.CLIENT_FILES_DIR || path.join(process.cwd(), 'uploads', 'clientes'));
  }

  private async ensureManualClientAccess(
    clientId: string,
    currentConsultorId: string,
    isSuperAdmin: boolean,
    requireActive: boolean = true
  ) {
    void currentConsultorId;
    void isSuperAdmin;
    const pool = await getDatabase();
    const activeClause = requireActive ? 'AND activo = 1' : '';
    const [clientRows] = await pool.execute(
      `SELECT id, consultor_id FROM CLIENTES_CONSULTOR
       WHERE id = ? ${activeClause}`,
      [clientId]
    );

    if (!Array.isArray(clientRows) || clientRows.length === 0) {
      throw new ValidationError('Manual client not found', { clientId: 'Client does not exist' });
    }

    const client = clientRows[0] as any;
    return client;
  }

  private async ensureManualClientExists(clientId: string, requireActive: boolean = true) {
    const pool = await getDatabase();
    const activeClause = requireActive ? 'AND activo = 1' : '';
    const [clientRows] = await pool.execute(
      `SELECT id FROM CLIENTES_CONSULTOR WHERE id = ? ${activeClause}`,
      [clientId]
    );

    if (!Array.isArray(clientRows) || clientRows.length === 0) {
      throw new ValidationError('Manual client not found', { clientId: 'Client does not exist' });
    }

    return clientRows[0] as any;
  }

  private async ensureConsultorExists(consultorId: string) {
    const pool = await getDatabase();
    const [rows] = await pool.execute(
      'SELECT id FROM CONSULTORES WHERE id = ? AND activo = 1',
      [consultorId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError('Consultor not found', { consultor_id: 'Consultor does not exist' });
    }
  }

  private async resolveServiceId(pool: any, serviceId?: string, serviceName?: string): Promise<string | null> {
    const cleanId = this.normalizeString(serviceId);
    if (cleanId) {
      const [rows] = await pool.execute(
        'SELECT id FROM SERVICIOS_CLIENTE WHERE id = ? AND activo = 1 LIMIT 1',
        [cleanId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('Service not found', { servicio_id: 'Service does not exist' });
      }

      return cleanId;
    }

    const cleanName = this.normalizeString(serviceName);
    if (!cleanName) return null;

    await this.syncServiceCatalog(pool, [cleanName]);
    const [rows] = await pool.execute(
      'SELECT id FROM SERVICIOS_CLIENTE WHERE nombre = ? LIMIT 1',
      [cleanName]
    );

    return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).id : null;
  }

  private normalizeFormValue(value: unknown): string | null {
    if (Array.isArray(value)) return this.normalizeString(value[0]);
    return this.normalizeString(value);
  }

  async listManualClientFiles(clientId: string, currentConsultorId: string, isSuperAdmin: boolean = false) {
    try {
      await this.ensureManualClientAccess(clientId, currentConsultorId, isSuperAdmin, false);
      const pool = await getDatabase();
      const [rows] = await pool.execute(
        `SELECT id, cliente_manual_id, campo, nombre_original, mime_type, size_bytes, created_at
         FROM CLIENTE_ARCHIVOS
         WHERE cliente_manual_id = ?
         ORDER BY created_at DESC`,
        [clientId]
      );

      return rows || [];
    } catch (error) {
      logger.error('Error listing manual client files:', error);
      throw error;
    }
  }

  async uploadManualClientFile(
    clientId: string,
    req: Request,
    currentConsultorId: string,
    isSuperAdmin: boolean = false
  ) {
    try {
      await this.ensureManualClientAccess(clientId, currentConsultorId, isSuperAdmin, true);

      const rootDir = this.getClientFilesRoot();
      const tmpDir = path.join(rootDir, '_tmp');
      const clientDir = path.join(rootDir, clientId);
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.mkdir(clientDir, { recursive: true });

      const maxFileSize = Number(process.env.CLIENT_FILE_MAX_SIZE_BYTES || 25 * 1024 * 1024);
      const form = formidable({
        uploadDir: tmpDir,
        keepExtensions: true,
        multiples: true,
        maxFileSize,
      });

      const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
        form.parse(req, (err: Error | null, parsedFields: any, parsedFiles: any) => {
          if (err) reject(err);
          else resolve({ fields: parsedFields, files: parsedFiles });
        });
      });

      const uploaded = files.archivo || Object.values(files)[0];
      if (!uploaded) {
        throw new ValidationError('archivo is required', { archivo: 'Required' });
      }

      const uploadedFiles = Array.isArray(uploaded) ? uploaded : [uploaded];
      const campo = this.normalizeFormValue(fields.campo || fields.tipo) || 'archivos_extras';
      const pool = await getDatabase();
      const savedFiles = [];

      for (const file of uploadedFiles) {
        const originalName = this.normalizeString((file as any).originalFilename) || 'archivo';
        const ext = path.extname(originalName).slice(0, 20);
        const fileId = uuidv4();
        const storedName = `${fileId}${ext}`;
        const relativePath = path.join(clientId, storedName);
        const targetPath = path.join(clientDir, storedName);

        await fs.rename((file as any).filepath, targetPath);

        await pool.execute(
          `INSERT INTO CLIENTE_ARCHIVOS (
             id, cliente_manual_id, campo, nombre_original, nombre_guardado,
             mime_type, size_bytes, relative_path, uploaded_by
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fileId,
            clientId,
            campo,
            originalName,
            storedName,
            (file as any).mimetype || null,
            Number((file as any).size || 0),
            relativePath,
            currentConsultorId,
          ]
        );

        savedFiles.push({
          id: fileId,
          cliente_manual_id: clientId,
          campo,
          nombre_original: originalName,
          mime_type: (file as any).mimetype || null,
          size_bytes: Number((file as any).size || 0),
        });
      }

      return savedFiles;
    } catch (error) {
      logger.error('Error uploading manual client file:', error);
      throw error;
    }
  }

  async getManualClientFile(
    clientId: string,
    fileId: string,
    currentConsultorId: string,
    isSuperAdmin: boolean = false
  ) {
    try {
      await this.ensureManualClientAccess(clientId, currentConsultorId, isSuperAdmin, false);
      const pool = await getDatabase();
      const [rows] = await pool.execute(
        `SELECT id, cliente_manual_id, nombre_original, mime_type, size_bytes, relative_path
         FROM CLIENTE_ARCHIVOS
         WHERE id = ? AND cliente_manual_id = ?
         LIMIT 1`,
        [fileId, clientId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('File not found', { fileId: 'File does not exist' });
      }

      const file = rows[0] as any;
      const rootDir = this.getClientFilesRoot();
      const absolutePath = path.resolve(rootDir, file.relative_path);
      if (!absolutePath.startsWith(rootDir + path.sep)) {
        throw new ValidationError('Invalid file path', { fileId: 'Invalid file path' });
      }

      return { ...file, absolutePath };
    } catch (error) {
      logger.error('Error retrieving manual client file:', error);
      throw error;
    }
  }

  async deleteManualClientFile(
    clientId: string,
    fileId: string,
    currentConsultorId: string,
    isSuperAdmin: boolean = false
  ) {
    try {
      const file = await this.getManualClientFile(clientId, fileId, currentConsultorId, isSuperAdmin);
      const pool = await getDatabase();
      await pool.execute(
        'DELETE FROM CLIENTE_ARCHIVOS WHERE id = ? AND cliente_manual_id = ?',
        [fileId, clientId]
      );

      await fs.unlink(file.absolutePath).catch(() => undefined);
      return { id: fileId, cliente_manual_id: clientId };
    } catch (error) {
      logger.error('Error deleting manual client file:', error);
      throw error;
    }
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

      const servicios = this.normalizeServices(data.servicios || []);
      const sesiones = this.normalizeSessions(data.sesiones || []);
      await this.syncServiceCatalog(pool, servicios);

      await pool.execute(
        `INSERT INTO CLIENTES_CONSULTOR (
           id, no_cliente, consultor_id, nombre, apellido, email, telefono_whatsapp,
           empresa, asesor_comercial, evento_previo, puesto, servicios, fuente_registro,
           fecha_registro, importe_total, ene, feb, mar, abr, may, jun, jul, ago, sep,
           oct, nov, dic, saldo, expediente, fecha_sesion_1, fecha_sesion_2, sesiones,
          observaciones, comentarios, benchmark, revision_financiera, minuta,
          candidato, ct, comentarios_ct, status, client_status, factura_1, drive_1, factura_2, drive_2,
          estatus_comercial, notas, created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clientId,
          this.normalizeString(data.no_cliente),
          consultorId,
          String(data.nombre).trim(),
          this.normalizeString(data.apellido),
          String(data.email).trim(),
          this.normalizeString(data.telefono_whatsapp),
          this.normalizeString(data.empresa) || 'NA',
          this.normalizeString(data.asesor_comercial),
          this.normalizeString(data.evento_previo),
          this.normalizeString(data.puesto),
          this.toJsonOrNull(servicios),
          this.normalizeString(data.fuente_registro) || 'manual_consultor',
          this.normalizeString(data.fecha_registro),
          this.normalizeMoney(data.importe_total),
          this.normalizeMoney(data.ene),
          this.normalizeMoney(data.feb),
          this.normalizeMoney(data.mar),
          this.normalizeMoney(data.abr),
          this.normalizeMoney(data.may),
          this.normalizeMoney(data.jun),
          this.normalizeMoney(data.jul),
          this.normalizeMoney(data.ago),
          this.normalizeMoney(data.sep),
          this.normalizeMoney(data.oct),
          this.normalizeMoney(data.nov),
          this.normalizeMoney(data.dic),
          this.normalizeMoney(data.saldo),
          this.normalizeString(data.expediente),
          this.normalizeString(data.fecha_sesion_1) || sesiones[0] || null,
          this.normalizeString(data.fecha_sesion_2) || sesiones[1] || null,
          this.toJsonOrNull(sesiones),
          this.normalizeString(data.observaciones),
          this.normalizeString(data.comentarios),
          this.normalizeString(data.benchmark),
          this.normalizeString(data.revision_financiera),
          this.normalizeString(data.minuta),
          this.normalizeString(data.candidato),
          this.normalizeString(data.ct),
          this.normalizeString(data.comentarios_ct),
          this.normalizeString(data.status),
          this.normalizeClientStatus(data.client_status),
          this.normalizeString(data.factura_1),
          this.normalizeString(data.drive_1),
          this.normalizeString(data.factura_2),
          this.normalizeString(data.drive_2),
          this.normalizeString(data.estatus_comercial) || 'prospecto',
          this.normalizeString(data.notas),
          currentConsultorId,
        ]
      );

      logger.info(`Manual consultant client created: ${clientId} by ${currentConsultorId}`);

      return {
        id: clientId,
        consultor_id: consultorId,
        ...data,
        empresa: this.normalizeString(data.empresa) || 'NA',
        fuente_registro: this.normalizeString(data.fuente_registro) || 'manual_consultor',
        client_status: this.normalizeClientStatus(data.client_status),
        sesiones,
        servicios,
      };
    } catch (error) {
      logger.error('Error creating manual client:', error);
      throw error;
    }
  }

  async listManualClients(
    currentConsultorId: string,
    isSuperAdmin: boolean = false,
    limit: number = 50,
    clientStatus?: string
  ) {
    try {
      const pool = await getDatabase();
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 50;
      const params: any[] = [];
      let query = `SELECT
          cc.*, c.nombre AS consultor_nombre, c.apellido AS consultor_apellido, c.email AS consultor_email
        FROM CLIENTES_CONSULTOR cc
        JOIN CONSULTORES c ON c.id = cc.consultor_id
        WHERE cc.activo = 1`;
      void currentConsultorId;
      void isSuperAdmin;

      if (clientStatus) {
        query += ' AND cc.client_status = ?';
        params.push(this.normalizeClientStatus(clientStatus));
      }

      query += ` ORDER BY cc.created_at DESC LIMIT ${safeLimit}`;

      const [rows] = await pool.execute(query, params);
      const clients = Array.isArray(rows) ? rows as any[] : [];
      return Promise.all(clients.map(async (client) => ({
        ...client,
        consultor_asignaciones: await this.listClientConsultantAssignments(client.id),
      })));
    } catch (error) {
      logger.error('Error listing manual clients:', error);
      throw error;
    }
  }

  async updateManualClient(
    clientId: string,
    data: Partial<ManualClientRequest>,
    currentConsultorId: string,
    isSuperAdmin: boolean = false
  ) {
    try {
      const pool = await getDatabase();
      const [clientRows] = await pool.execute(
        `SELECT id, consultor_id FROM CLIENTES_CONSULTOR
         WHERE id = ? AND activo = 1`,
        [clientId]
      );

      if (!Array.isArray(clientRows) || clientRows.length === 0) {
        throw new ValidationError('Manual client not found', { clientId: 'Client does not exist' });
      }

      const existingClient = clientRows[0] as any;
      void currentConsultorId;

      const assignments: string[] = [];
      const values: any[] = [];

      for (const field of MANUAL_CLIENT_MUTABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          assignments.push(`${field} = ?`);
          values.push(this.normalizeManualClientValue(field, (data as any)[field]));
        }
      }

      if (isSuperAdmin && data.consultor_id) {
        assignments.push('consultor_id = ?');
        values.push(String(data.consultor_id).trim());
      }

      if (assignments.length === 0) {
        return existingClient;
      }

      if (Object.prototype.hasOwnProperty.call(data, 'servicios')) {
        await this.syncServiceCatalog(pool, this.normalizeServices(data.servicios || []));
      }

      values.push(clientId);
      await pool.execute(
        `UPDATE CLIENTES_CONSULTOR
         SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = ?`,
        values
      );

      const [updatedRows] = await pool.execute(
        `SELECT cc.*, c.nombre AS consultor_nombre, c.apellido AS consultor_apellido, c.email AS consultor_email
         FROM CLIENTES_CONSULTOR cc
         JOIN CONSULTORES c ON c.id = cc.consultor_id
         WHERE cc.id = ?`,
        [clientId]
      );

      return Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : { id: clientId };
    } catch (error) {
      logger.error('Error updating manual client:', error);
      throw error;
    }
  }

  async updateManualClientStatus(
    clientId: string,
    clientStatus: unknown,
    currentConsultorId: string,
    isSuperAdmin: boolean = false
  ) {
    return this.updateManualClient(
      clientId,
      { client_status: this.normalizeClientStatus(clientStatus) },
      currentConsultorId,
      isSuperAdmin
    );
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
           id, no_cliente, lead_id, cliente_manual_id, cliente_id, cita_id, consultor_id,
           tipo_origen, fuente_registro, fecha_registro, nombre, email, telefono_whatsapp,
           empresa, asesor_comercial, evento_previo, puesto, servicios, importe_total,
           ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov, dic, saldo,
           expediente, fecha_sesion_1, fecha_sesion_2, sesiones, observaciones, comentarios,
           benchmark, revision_financiera, minuta, candidato, ct, comentarios_ct,
           status, client_status, factura_1, drive_1, factura_2, drive_2, etiqueta, motivo,
           estado_lead, estado_cita, estatus_comercial, meet_link, fecha_hora_inicio, fecha_hora_fin,
           archived_by, archived_at, lead_snapshot, cliente_manual_snapshot, cliente_snapshot, cita_snapshot
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
        [
          historicoId,
          manualClient.no_cliente || null,
          null,
          manualClient.id,
          null,
          null,
          manualClient.consultor_id,
          'no_organico',
          manualClient.fuente_registro || 'manual_consultor',
          manualClient.fecha_registro || null,
          manualClient.nombre,
          manualClient.email,
          manualClient.telefono_whatsapp || null,
          manualClient.empresa || null,
          manualClient.asesor_comercial || null,
          manualClient.evento_previo || null,
          manualClient.puesto || null,
          this.toJsonOrNull(manualClient.servicios),
          manualClient.importe_total ?? null,
          manualClient.ene ?? null,
          manualClient.feb ?? null,
          manualClient.mar ?? null,
          manualClient.abr ?? null,
          manualClient.may ?? null,
          manualClient.jun ?? null,
          manualClient.jul ?? null,
          manualClient.ago ?? null,
          manualClient.sep ?? null,
          manualClient.oct ?? null,
          manualClient.nov ?? null,
          manualClient.dic ?? null,
          manualClient.saldo ?? null,
          manualClient.expediente || null,
          manualClient.fecha_sesion_1 || null,
          manualClient.fecha_sesion_2 || null,
          this.toJsonOrNull(manualClient.sesiones),
          manualClient.observaciones || null,
          manualClient.comentarios || null,
          manualClient.benchmark || null,
          manualClient.revision_financiera || null,
          manualClient.minuta || null,
          manualClient.candidato || null,
          manualClient.ct || null,
          manualClient.comentarios_ct || null,
          manualClient.status || null,
          manualClient.client_status || CLIENT_STATUS_DEFAULT,
          manualClient.factura_1 || null,
          manualClient.drive_1 || null,
          manualClient.factura_2 || null,
          manualClient.drive_2 || null,
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

      await connection.execute(
        `INSERT INTO DIAGNOSTICOS_CLIENTES (
           id, cliente_ref_tipo, cliente_ref_id, consultor_id, estado, respuestas,
           resumen, saved_at, completed_at, created_by, updated_by
         )
         SELECT UUID(), 'historico_cliente', ?, consultor_id, estado, respuestas,
                resumen, saved_at, completed_at, created_by, updated_by
         FROM DIAGNOSTICOS_CLIENTES
         WHERE cliente_ref_tipo = 'cliente_consultor'
           AND cliente_ref_id = ?
         ON DUPLICATE KEY UPDATE
           consultor_id = VALUES(consultor_id),
           estado = VALUES(estado),
           respuestas = VALUES(respuestas),
           resumen = VALUES(resumen),
           saved_at = VALUES(saved_at),
           completed_at = VALUES(completed_at),
           updated_by = VALUES(updated_by)`,
        [historicoId, clientId]
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

  async restoreManualClientFromHistory(historicoId: string, currentConsultorId: string, isSuperAdmin: boolean = false) {
    const pool = await getDatabase();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [historyRows] = await connection.execute(
        'SELECT * FROM HISTORICO_CLIENTES WHERE id = ? LIMIT 1',
        [historicoId]
      );

      if (!Array.isArray(historyRows) || historyRows.length === 0) {
        throw new ValidationError('History item not found', { historicoId: 'History item does not exist' });
      }

      const history = historyRows[0] as any;
      const targetConsultorId = isSuperAdmin && history.consultor_id ? history.consultor_id : currentConsultorId;
      const clientId = history.cliente_manual_id || uuidv4();

      if (!isSuperAdmin && history.consultor_id && history.consultor_id !== currentConsultorId) {
        throw new ValidationError('History item not found', { historicoId: 'History item does not exist' });
      }

      const [existingRows] = await connection.execute(
        'SELECT id FROM CLIENTES_CONSULTOR WHERE id = ? LIMIT 1',
        [clientId]
      );

      const values = [
        history.no_cliente || null,
        targetConsultorId,
        history.nombre,
        history.apellido || null,
        history.email,
        history.telefono_whatsapp || null,
        history.empresa || null,
        history.asesor_comercial || null,
        history.evento_previo || null,
        history.puesto || null,
        this.toJsonOrNull(history.servicios),
        history.fuente_registro || 'restaurado_historico',
        history.fecha_registro || null,
        history.importe_total ?? null,
        history.ene ?? null,
        history.feb ?? null,
        history.mar ?? null,
        history.abr ?? null,
        history.may ?? null,
        history.jun ?? null,
        history.jul ?? null,
        history.ago ?? null,
        history.sep ?? null,
        history.oct ?? null,
        history.nov ?? null,
        history.dic ?? null,
        history.saldo ?? null,
        history.expediente || null,
        history.fecha_sesion_1 || null,
        history.fecha_sesion_2 || null,
        this.toJsonOrNull(history.sesiones),
        history.observaciones || null,
        history.comentarios || null,
        history.benchmark || null,
        history.revision_financiera || null,
        history.minuta || null,
        history.candidato || null,
        history.ct || null,
        history.comentarios_ct || null,
        history.status || null,
        history.client_status || CLIENT_STATUS_DEFAULT,
        history.factura_1 || null,
        history.drive_1 || null,
        history.factura_2 || null,
        history.drive_2 || null,
        history.estatus_comercial || 'cliente',
        history.motivo || null,
      ];

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        await connection.execute(
          `UPDATE CLIENTES_CONSULTOR
           SET no_cliente = ?, consultor_id = ?, nombre = ?, apellido = ?, email = ?,
               telefono_whatsapp = ?, empresa = ?, asesor_comercial = ?, evento_previo = ?,
               puesto = ?, servicios = ?, fuente_registro = ?, fecha_registro = ?,
               importe_total = ?, ene = ?, feb = ?, mar = ?, abr = ?, may = ?, jun = ?,
               jul = ?, ago = ?, sep = ?, oct = ?, nov = ?, dic = ?, saldo = ?,
               expediente = ?, fecha_sesion_1 = ?, fecha_sesion_2 = ?, sesiones = ?, observaciones = ?,
               comentarios = ?, benchmark = ?, revision_financiera = ?, minuta = ?,
               candidato = ?, ct = ?, comentarios_ct = ?, status = ?, client_status = ?, factura_1 = ?,
               drive_1 = ?, factura_2 = ?, drive_2 = ?, estatus_comercial = ?, notas = ?, activo = 1,
               updated_at = NOW()
           WHERE id = ?`,
          [...values, clientId]
        );
      } else {
        await connection.execute(
          `INSERT INTO CLIENTES_CONSULTOR (
             id, no_cliente, consultor_id, nombre, apellido, email, telefono_whatsapp,
             empresa, asesor_comercial, evento_previo, puesto, servicios, fuente_registro,
             fecha_registro, importe_total, ene, feb, mar, abr, may, jun, jul, ago, sep,
             oct, nov, dic, saldo, expediente, fecha_sesion_1, fecha_sesion_2, sesiones,
             observaciones, comentarios, benchmark, revision_financiera, minuta,
             candidato, ct, comentarios_ct, status, client_status, factura_1, drive_1, factura_2, drive_2,
             estatus_comercial, notas, activo, created_by
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [clientId, ...values, currentConsultorId]
        );
      }

      await connection.execute(
        `INSERT INTO DIAGNOSTICOS_CLIENTES (
           id, cliente_ref_tipo, cliente_ref_id, consultor_id, estado, respuestas,
           resumen, saved_at, completed_at, created_by, updated_by
         )
         SELECT UUID(), 'cliente_consultor', ?, consultor_id, estado, respuestas,
                resumen, saved_at, completed_at, created_by, updated_by
         FROM DIAGNOSTICOS_CLIENTES
         WHERE cliente_ref_tipo = 'historico_cliente'
           AND cliente_ref_id = ?
         ON DUPLICATE KEY UPDATE
           consultor_id = VALUES(consultor_id),
           estado = VALUES(estado),
           respuestas = VALUES(respuestas),
           resumen = VALUES(resumen),
           saved_at = VALUES(saved_at),
           completed_at = VALUES(completed_at),
           updated_by = VALUES(updated_by)`,
        [clientId, historicoId]
      );

      await connection.execute(
        `UPDATE HISTORICO_CLIENTES
         SET etiqueta = 'cliente_restaurado',
             motivo = CONCAT(COALESCE(motivo, ''), CASE WHEN motivo IS NULL OR motivo = '' THEN '' ELSE ' | ' END, 'Cliente restaurado a activos')
         WHERE id = ?`,
        [historicoId]
      );

      await connection.commit();

      logger.info(`Manual client restored from history: ${historicoId}; client=${clientId}`);
      return {
        historicoId,
        clienteManualId: clientId,
        mensaje: 'Cliente restaurado a clientes activos.',
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error restoring manual client from history:', error);
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
      `INSERT INTO CLIENTES (id, nombre, email, telefono_whatsapp, empresa, puesto, origen, estatus_comercial, client_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        clientId,
        lead.nombre,
        lead.email,
        lead.telefono_whatsapp || null,
        lead.empresa || null,
        lead.puesto || null,
        lead.origen || 'web',
        lead.estatus_comercial || 'interesado',
        CLIENT_STATUS_DEFAULT,
      ]
    );

    logger.info(`New client created from lead: ${clientId}`);
    return clientId;
  }
}

export const leadApprovalController = new LeadApprovalController();

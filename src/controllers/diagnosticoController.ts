import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { AppError, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';

type DiagnosticoRefTipo = 'cliente_consultor' | 'historico_cliente';

interface SaveDiagnosticoRequest {
  respuestas: unknown;
  estado?: string;
  resumen?: string | null;
}

class DiagnosticoController {
  async getDiagnostico(
    refTipo: DiagnosticoRefTipo,
    refId: string,
    currentConsultorId: string,
    isSuperAdmin: boolean = false
  ) {
    await this.ensureAccess(refTipo, refId, currentConsultorId, isSuperAdmin);

    const pool = await getDatabase();
    const [rows] = await pool.execute(
      `SELECT
         id, cliente_ref_tipo, cliente_ref_id, consultor_id, estado, respuestas,
         resumen, saved_at, completed_at, created_by, updated_by, created_at, updated_at
       FROM DIAGNOSTICOS_CLIENTES
       WHERE cliente_ref_tipo = ? AND cliente_ref_id = ?
       LIMIT 1`,
      [refTipo, refId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    return rows[0];
  }

  async saveDiagnostico(
    refTipo: DiagnosticoRefTipo,
    refId: string,
    data: SaveDiagnosticoRequest,
    currentConsultorId: string,
    isSuperAdmin: boolean = false
  ) {
    if (!data || data.respuestas === undefined || data.respuestas === null) {
      throw new ValidationError('respuestas is required', { respuestas: 'Required' });
    }

    const ownerConsultorId = await this.ensureAccess(refTipo, refId, currentConsultorId, isSuperAdmin);
    const estado = this.normalizeEstado(data.estado);
    const respuestas = JSON.stringify(data.respuestas);
    const resumen = data.resumen === undefined || data.resumen === null ? null : String(data.resumen).trim();
    const pool = await getDatabase();
    const diagnosticoId = uuidv4();

    await pool.execute(
      `INSERT INTO DIAGNOSTICOS_CLIENTES (
         id, cliente_ref_tipo, cliente_ref_id, consultor_id, estado, respuestas,
         resumen, saved_at, completed_at, created_by, updated_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         consultor_id = VALUES(consultor_id),
         estado = VALUES(estado),
         respuestas = VALUES(respuestas),
         resumen = VALUES(resumen),
         saved_at = NOW(),
         completed_at = VALUES(completed_at),
         updated_by = VALUES(updated_by)`,
      [
        diagnosticoId,
        refTipo,
        refId,
        ownerConsultorId,
        estado,
        respuestas,
        resumen,
        estado === 'completado' ? new Date() : null,
        currentConsultorId,
        currentConsultorId,
      ]
    );

    logger.info(`Diagnostico saved: ${refTipo}:${refId} by ${currentConsultorId}`);

    return this.getDiagnostico(refTipo, refId, currentConsultorId, isSuperAdmin);
  }

  private normalizeEstado(estado?: string): string {
    if (estado === 'completado') {
      return 'completado';
    }

    return 'borrador';
  }

  private async ensureAccess(
    refTipo: DiagnosticoRefTipo,
    refId: string,
    currentConsultorId: string,
    isSuperAdmin: boolean
  ): Promise<string> {
    const pool = await getDatabase();

    if (refTipo === 'cliente_consultor') {
      const [rows] = await pool.execute(
        'SELECT consultor_id FROM CLIENTES_CONSULTOR WHERE id = ? LIMIT 1',
        [refId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('Client not found', { clientId: 'Client does not exist' });
      }

      const consultorId = (rows[0] as any).consultor_id;
      if (!isSuperAdmin && consultorId !== currentConsultorId) {
        throw new AppError('You do not have access to this client', 403);
      }

      return consultorId;
    }

    if (refTipo === 'historico_cliente') {
      const [rows] = await pool.execute(
        `SELECT COALESCE(consultor_id, archived_by) AS consultor_id
         FROM HISTORICO_CLIENTES
         WHERE id = ?
         LIMIT 1`,
        [refId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new ValidationError('History item not found', { historicoId: 'History item does not exist' });
      }

      const consultorId = (rows[0] as any).consultor_id || currentConsultorId;
      if (!isSuperAdmin && consultorId !== currentConsultorId) {
        throw new AppError('You do not have access to this history item', 403);
      }

      return consultorId;
    }

    throw new ValidationError('Invalid diagnostico reference type', { refTipo: 'Invalid reference type' });
  }
}

export const diagnosticoController = new DiagnosticoController();

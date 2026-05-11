import { getDatabase } from '../config/database';
import { logger } from '../config/logger';

class RoundRobinService {
  /**
   * Asigna automáticamente el siguiente consultor disponible al lead
   */
  async asignarConsultor(leadId: string): Promise<string | null> {
    const pool = await getDatabase();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // 1. Obtener todos los consultores activos ordenados por turno
      const [consultores] = await conn.execute(
        'SELECT id, nombre, turno_orden, ultimo_lead_asignado FROM CONSULTORES WHERE activo = 1 ORDER BY turno_orden ASC, ultimo_lead_asignado ASC, created_at ASC'
      );

      if (!Array.isArray(consultores) || consultores.length === 0) {
        logger.warn('No hay consultores activos para asignar');
        await conn.rollback();
        return null;
      }

      // 2. El primero en la lista es al que le toca
      const consultor = (consultores as any[])[0];

      // 3. Asignar el lead a ese consultor
      await conn.execute(
        'UPDATE LEADS_EN_ESPERA SET consultor_asignado_id = ?, fecha_asignacion = NOW() WHERE id = ?',
        [consultor.id, leadId]
      );

      // 4. Calcular el siguiente turno_orden
      const maxTurno = Math.max(
        ...(consultores as any[]).map((c: any) => c.turno_orden || 0)
      );

      await conn.execute(
        'UPDATE CONSULTORES SET turno_orden = ?, ultimo_lead_asignado = NOW() WHERE id = ?',
        [maxTurno + 1, consultor.id]
      );

      await conn.commit();

      logger.info(
        `Lead ${leadId} asignado a consultor ${consultor.nombre} (${consultor.id})`
      );

      return consultor.id as string;
    } catch (error) {
      await conn.rollback();
      logger.error('Error en round-robin:', error);
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Ver a quién le toca el próximo lead (sin asignar todavía)
   */
  async verProximoConsultor(): Promise<any> {
    const pool = await getDatabase();

    const [rows] = await pool.execute(
      'SELECT id, nombre, turno_orden, ultimo_lead_asignado FROM CONSULTORES WHERE activo = 1 ORDER BY turno_orden ASC, ultimo_lead_asignado ASC LIMIT 1'
    );

    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Reasignar un lead a otro consultor manualmente
   */
  async reasignarLead(
    leadId: string,
    nuevoConsultorId: string
  ): Promise<void> {
    const pool = await getDatabase();

    await pool.execute(
      'UPDATE LEADS_EN_ESPERA SET consultor_asignado_id = ?, fecha_asignacion = NOW() WHERE id = ?',
      [nuevoConsultorId, leadId]
    );

    logger.info(`Lead ${leadId} reasignado a consultor ${nuevoConsultorId}`);
  }

  /**
   * Resetear los turnos (útil si se agregan nuevos consultores)
   */
  async resetearTurnos(): Promise<void> {
    const pool = await getDatabase();

    await pool.execute(
      'UPDATE CONSULTORES SET turno_orden = 0, ultimo_lead_asignado = NULL'
    );

    logger.info('Turnos de consultores reseteados');
  }

  /**
   * Ver el estado actual de la cola de turnos
   */
  async verColaTurnos(): Promise<any[]> {
    const pool = await getDatabase();

    const [rows] = await pool.execute(
      "SELECT id, nombre, email, turno_orden, ultimo_lead_asignado, (SELECT COUNT(*) FROM LEADS_EN_ESPERA WHERE consultor_asignado_id = CONSULTORES.id AND estado = 'pendiente') as leads_pendientes FROM CONSULTORES WHERE activo = 1 ORDER BY turno_orden ASC"
    );

    return Array.isArray(rows) ? (rows as any[]) : [];
  }
}

export const roundRobinService = new RoundRobinService();
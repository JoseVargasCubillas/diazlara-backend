import { getDatabase } from '../config/database';
import { logger } from '../config/logger';

const DEFAULT_AGENDA_ROUND_ROBIN_NAMES = ['daniela', 'jesus', 'jesús'];

class RoundRobinService {
  private normalizeName(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private getAllowedAgendaNames(): string[] {
    const configured = process.env.AGENDA_ROUND_ROBIN_CONSULTORES || '';
    const names = configured
      ? configured.split(',').map((item) => this.normalizeName(item)).filter(Boolean)
      : DEFAULT_AGENDA_ROUND_ROBIN_NAMES.map((item) => this.normalizeName(item));

    return Array.from(new Set(names));
  }

  private isAgendaRoundRobinConsultor(consultor: any): boolean {
    const allowed = this.getAllowedAgendaNames();
    const nombre = this.normalizeName(consultor?.nombre);
    const fullName = this.normalizeName(`${consultor?.nombre || ''} ${consultor?.apellido || ''}`);

    return allowed.some((allowedName) => nombre === allowedName || fullName.includes(allowedName));
  }

  async isAgendaRoundRobinConsultorId(consultorId: string): Promise<boolean> {
    if (!consultorId) return false;

    const pool = await getDatabase();
    const [rows] = await pool.execute(
      'SELECT id, nombre, apellido FROM CONSULTORES WHERE id = ? AND activo = 1 LIMIT 1',
      [consultorId]
    );

    return Array.isArray(rows) && rows.length > 0
      ? this.isAgendaRoundRobinConsultor((rows as any[])[0])
      : false;
  }

  async asignarConsultor(leadId: string): Promise<string | null> {
    const pool = await getDatabase();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [consultores] = await conn.execute(
        'SELECT id, nombre, apellido, turno_orden, ultimo_lead_asignado FROM CONSULTORES WHERE activo = 1 ORDER BY turno_orden ASC, ultimo_lead_asignado ASC, created_at ASC'
      );

      const agendaConsultores = Array.isArray(consultores)
        ? (consultores as any[]).filter((consultor) => this.isAgendaRoundRobinConsultor(consultor))
        : [];

      if (agendaConsultores.length === 0) {
        logger.warn('No hay consultores activos de agenda para asignar');
        await conn.rollback();
        return null;
      }

      const consultor = agendaConsultores[0];

      await conn.execute(
        'UPDATE LEADS_EN_ESPERA SET consultor_id = ?, updated_at = NOW() WHERE id = ?',
        [consultor.id, leadId]
      );

      const maxTurno = Math.max(...agendaConsultores.map((c: any) => c.turno_orden || 0));

      await conn.execute(
        'UPDATE CONSULTORES SET turno_orden = ?, ultimo_lead_asignado = NOW() WHERE id = ?',
        [maxTurno + 1, consultor.id]
      );

      await conn.commit();

      logger.info(`Lead ${leadId} asignado a consultor de agenda ${consultor.nombre} (${consultor.id})`);

      return consultor.id as string;
    } catch (error) {
      await conn.rollback();
      logger.error('Error en round-robin:', error);
      throw error;
    } finally {
      conn.release();
    }
  }

  async verProximoConsultor(): Promise<any> {
    const pool = await getDatabase();

    const [rows] = await pool.execute(
      'SELECT id, nombre, apellido, turno_orden, ultimo_lead_asignado FROM CONSULTORES WHERE activo = 1 ORDER BY turno_orden ASC, ultimo_lead_asignado ASC'
    );

    const agendaConsultores = Array.isArray(rows)
      ? (rows as any[]).filter((consultor) => this.isAgendaRoundRobinConsultor(consultor))
      : [];

    return agendaConsultores.length > 0 ? agendaConsultores[0] : null;
  }

  async reasignarLead(leadId: string, nuevoConsultorId: string): Promise<void> {
    const pool = await getDatabase();

    await pool.execute(
      'UPDATE LEADS_EN_ESPERA SET consultor_id = ?, updated_at = NOW() WHERE id = ?',
      [nuevoConsultorId, leadId]
    );

    logger.info(`Lead ${leadId} reasignado a consultor ${nuevoConsultorId}`);
  }

  async resetearTurnos(): Promise<void> {
    const pool = await getDatabase();

    await pool.execute(
      'UPDATE CONSULTORES SET turno_orden = 0, ultimo_lead_asignado = NULL'
    );

    logger.info('Turnos de consultores reseteados');
  }

  async verColaTurnos(): Promise<any[]> {
    const pool = await getDatabase();

    const [rows] = await pool.execute(
      "SELECT id, nombre, apellido, email, turno_orden, ultimo_lead_asignado, (SELECT COUNT(*) FROM LEADS_EN_ESPERA WHERE consultor_id = CONSULTORES.id AND estado = 'pendiente') as leads_pendientes FROM CONSULTORES WHERE activo = 1 ORDER BY turno_orden ASC"
    );

    return Array.isArray(rows)
      ? (rows as any[]).filter((consultor) => this.isAgendaRoundRobinConsultor(consultor))
      : [];
  }
}

export const roundRobinService = new RoundRobinService();

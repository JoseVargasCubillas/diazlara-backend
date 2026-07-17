/**
 * CalendarAccountRegistry — configuración centralizada de cuentas de
 * Google Calendar para el proyecto.
 *
 * Cada cuenta es una combinación de:
 *  - `impersonateUser` — usuario Google Workspace impersonado por el
 *    service account (organizador del evento y dueño del Meet).
 *  - `calendarId` — ID del calendario en el que se inserta el evento
 *    ("primary" es el calendario principal del `impersonateUser`).
 *  - `consultorIds` — lista de UUIDs (`CONSULTORES.id`) que deben usar
 *    esta cuenta al agendar. Se usa como identificador estable para
 *    evitar depender del nombre visible.
 *
 * Origen de la configuración (prioridad de mayor a menor):
 *  1. `GOOGLE_CALENDAR_ACCOUNTS`  — JSON con la lista completa de
 *     cuentas. Formato:
 *       [
 *         {
 *           "key": "jessica",
 *           "impersonateUser": "jessica.tapia@diegodiaz.mx",
 *           "calendarId": "primary",
 *           "consultorIds": ["<UUID Jessica>"]
 *         },
 *         {
 *           "key": "jazmin",
 *           "impersonateUser": "fiscalista@diegodiaz.mx",
 *           "calendarId": "primary",
 *           "consultorIds": ["<UUID Jazmin>"]
 *         }
 *       ]
 *  2. Compatibilidad hacia atrás: si NO se define
 *     `GOOGLE_CALENDAR_ACCOUNTS`, se registra una sola cuenta `legacy`
 *     con los valores `GOOGLE_IMPERSONATE_USER` + `GOOGLE_CALENDAR_ID`
 *     y sin `consultorIds`. Se acepta como fallback SOLO durante la
 *     transición; el resolver la rechazará si `STRICT_CALENDAR_ACCOUNTS`
 *     está en `true` (recomendado en producción).
 *
 * NOTA de seguridad: nunca guardamos tokens en la BD. Todo secreto
 * (service account JSON) sigue viviendo en env.
 */
import { logger } from '../config/logger';

export interface CalendarAccountConfig {
  /** Identificador estable de la cuenta (p.ej. "jessica"). */
  key: string;
  /** Usuario Workspace impersonado (organizador de Meet). */
  impersonateUser: string;
  /** ID del calendario en el que se insertan los eventos. */
  calendarId: string;
  /** UUIDs de CONSULTORES que resuelven a esta cuenta. */
  consultorIds: string[];
  /** Marca `legacy` para poder distinguir en logs y validaciones. */
  legacy?: boolean;
}

class CalendarAccountRegistry {
  private cache: CalendarAccountConfig[] | null = null;

  private normalizeId(value: unknown): string {
    return String(value || '').trim().toLowerCase();
  }

  private loadFromJson(raw: string): CalendarAccountConfig[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      throw new Error(
        `GOOGLE_CALENDAR_ACCOUNTS no es JSON válido: ${err?.message || err}`
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error('GOOGLE_CALENDAR_ACCOUNTS debe ser un arreglo JSON.');
    }

    const out: CalendarAccountConfig[] = [];
    const seenKeys = new Set<string>();

    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const key = String(item.key || '').trim();
      const impersonateUser = String(item.impersonateUser || '').trim();
      const calendarId = String(item.calendarId || 'primary').trim() || 'primary';
      const consultorIds = Array.isArray(item.consultorIds)
        ? (item.consultorIds as unknown[])
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        : [];

      if (!key) throw new Error('GOOGLE_CALENDAR_ACCOUNTS: cada cuenta requiere `key`.');
      if (!impersonateUser) {
        throw new Error(`GOOGLE_CALENDAR_ACCOUNTS[${key}]: falta impersonateUser.`);
      }
      if (seenKeys.has(key)) {
        throw new Error(`GOOGLE_CALENDAR_ACCOUNTS: key duplicada "${key}".`);
      }
      seenKeys.add(key);

      out.push({ key, impersonateUser, calendarId, consultorIds });
    }

    // Un consultor no debe estar en dos cuentas.
    const seenConsultors = new Map<string, string>();
    for (const acc of out) {
      for (const cid of acc.consultorIds) {
        const norm = this.normalizeId(cid);
        const prev = seenConsultors.get(norm);
        if (prev && prev !== acc.key) {
          throw new Error(
            `GOOGLE_CALENDAR_ACCOUNTS: consultor ${cid} está en dos cuentas (${prev} y ${acc.key}).`
          );
        }
        seenConsultors.set(norm, acc.key);
      }
    }

    return out;
  }

  private buildLegacyAccount(): CalendarAccountConfig | null {
    const impersonateUser = (process.env.GOOGLE_IMPERSONATE_USER || '').trim();
    const calendarId = (process.env.GOOGLE_CALENDAR_ID || '').trim();
    if (!impersonateUser || !calendarId) return null;
    return {
      key: 'legacy',
      impersonateUser,
      calendarId,
      consultorIds: [],
      legacy: true,
    };
  }

  /** Devuelve la lista de cuentas configuradas (cacheada). */
  list(): CalendarAccountConfig[] {
    if (this.cache) return this.cache;

    const raw = (process.env.GOOGLE_CALENDAR_ACCOUNTS || '').trim();
    if (raw) {
      this.cache = this.loadFromJson(raw);
      logger.info(
        `[CalendarRegistry] ${this.cache.length} cuenta(s) configurada(s): ${this.cache
          .map((a) => a.key)
          .join(', ')}`
      );
      return this.cache;
    }

    const legacy = this.buildLegacyAccount();
    if (legacy) {
      this.cache = [legacy];
      logger.warn(
        '[CalendarRegistry] Usando cuenta LEGACY (una sola). ' +
          'Configura GOOGLE_CALENDAR_ACCOUNTS para soportar Jessica y Jazmin por separado.'
      );
      return this.cache;
    }

    this.cache = [];
    return this.cache;
  }

  /** Busca una cuenta por su `key`. */
  getByKey(key: string): CalendarAccountConfig | null {
    if (!key) return null;
    const norm = key.toLowerCase();
    return this.list().find((a) => a.key.toLowerCase() === norm) || null;
  }

  /**
   * Resuelve la cuenta que corresponde a un consultor. Prioridad:
   *  1. Match exacto de `consultor_id` en `consultorIds`.
   *  2. Si `STRICT_CALENDAR_ACCOUNTS` !== 'true' y existe la cuenta
   *     legacy, se devuelve como fallback (con un warn).
   *  3. Devuelve `null` si nada coincide.
   */
  resolveForConsultor(consultorId: string): CalendarAccountConfig | null {
    const norm = this.normalizeId(consultorId);
    if (!norm) return null;

    const accounts = this.list();
    for (const acc of accounts) {
      if (acc.consultorIds.some((cid) => this.normalizeId(cid) === norm)) {
        return acc;
      }
    }

    const strict = (process.env.STRICT_CALENDAR_ACCOUNTS || 'false').toLowerCase() === 'true';
    if (!strict) {
      const legacy = accounts.find((a) => a.legacy);
      if (legacy) {
        logger.warn(
          `[CalendarRegistry] consultor ${consultorId} no está mapeado; usando cuenta LEGACY.`
        );
        return legacy;
      }
    }

    return null;
  }

  /** Sólo para tests. */
  reset(): void {
    this.cache = null;
  }
}

export const calendarAccountRegistry = new CalendarAccountRegistry();

/**
 * GoogleMeetService — crea eventos de Google Calendar con Meet y los
 * cancela/consulta usando **una o varias cuentas** de Workspace.
 *
 * Autenticación: Service Account con Domain-Wide Delegation. El service
 * account impersona al `impersonateUser` configurado en cada cuenta
 * (ver `CalendarAccountRegistry`).
 *
 * Configuración .env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   # o ruta o base64
 *   # Multi-cuenta (recomendado):
 *   GOOGLE_CALENDAR_ACCOUNTS=[{"key":"jessica","impersonateUser":"...","calendarId":"primary","consultorIds":["<uuid>"]},{"key":"jazmin",...}]
 *   # Modo compatibilidad (una sola cuenta, se registra como "legacy"):
 *   GOOGLE_IMPERSONATE_USER=contacto@diazlara.mx
 *   GOOGLE_CALENDAR_ID=primary
 *   # Producción recomendado: exige mapeo explícito.
 *   STRICT_CALENDAR_ACCOUNTS=true
 */
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import { env } from '../config/environment';
import { logger } from '../config/logger';
import {
  calendarAccountRegistry,
  CalendarAccountConfig,
} from './CalendarAccountRegistry';

class GoogleMeetService {
  private jwtByAccount = new Map<string, JWT>();
  private serviceAccountEmail: string | null = null;
  private serviceAccountKey: any = null;

  private getExtraAttendeeEmails(): string[] {
    return (env.GOOGLE_MEET_EXTRA_ATTENDEES || '')
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
  }

  private buildAttendees(
    consultantEmail: string,
    clientEmail: string,
    clientName: string
  ): Array<{ email: string; displayName?: string }> {
    const attendees = [
      { email: consultantEmail },
      ...this.getExtraAttendeeEmails().map((email) => ({ email })),
      { email: clientEmail, displayName: clientName },
    ];

    const seen = new Set<string>();
    return attendees.filter((attendee) => {
      const normalizedEmail = attendee.email.toLowerCase();
      if (seen.has(normalizedEmail)) return false;
      seen.add(normalizedEmail);
      return true;
    });
  }

  private getGoogleErrorMessage(err: any): string {
    const googleError = err?.response?.data?.error;
    const googleDescription = err?.response?.data?.error_description;
    const googleMessage = err?.response?.data?.error?.message;

    if (googleDescription && googleError) return `${googleError}: ${googleDescription}`;
    if (googleMessage) return googleMessage;
    if (googleError) return typeof googleError === 'string' ? googleError : JSON.stringify(googleError);
    return err?.message || String(err);
  }

  private getGoogleErrorDebug(err: any): Record<string, unknown> {
    return {
      status: err?.response?.status,
      statusText: err?.response?.statusText,
      data: err?.response?.data,
      message: err?.message,
      code: err?.code,
    };
  }

  private parseServiceAccountKey(rawValue: string): any {
    const trimmedValue = rawValue.trim();
    const parseJson = (value: string) => JSON.parse(value.replace(/^\uFEFF/, ''));

    try {
      return parseJson(trimmedValue);
    } catch {
      // Continue with the supported fallback formats below.
    }

    if (fs.existsSync(trimmedValue)) {
      try {
        return parseJson(fs.readFileSync(trimmedValue, 'utf8'));
      } catch (err: any) {
        throw new Error(
          `GOOGLE_SERVICE_ACCOUNT_JSON apunta a un archivo, pero no se pudo leer como JSON válido: ${err?.message || err}`
        );
      }
    }

    try {
      return parseJson(Buffer.from(trimmedValue, 'base64').toString('utf8'));
    } catch {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON tiene formato inválido. ' +
        'Usa el JSON completo en una sola línea, una ruta a un archivo .json, o el JSON codificado en base64.'
      );
    }
  }

  private loadServiceAccountKey(): any {
    if (this.serviceAccountKey) return this.serviceAccountKey;
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON no está configurado. ' +
        'Agrega el JSON del Service Account en el archivo .env.'
      );
    }
    this.serviceAccountKey = this.parseServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    this.serviceAccountEmail = this.serviceAccountKey.client_email;
    return this.serviceAccountKey;
  }

  private async getAuthForAccount(account: CalendarAccountConfig): Promise<JWT> {
    const cached = this.jwtByAccount.get(account.key);
    if (cached) return cached;

    const key = this.loadServiceAccountKey();

    const impersonated = account.impersonateUser.trim();
    if (!impersonated) {
      throw new Error(
        `Cuenta de calendario "${account.key}" no tiene impersonateUser configurado.`
      );
    }
    if (impersonated.toLowerCase() === String(key.client_email).toLowerCase()) {
      throw new Error(
        `Cuenta de calendario "${account.key}": impersonateUser no puede ser el email del ` +
          `service account. Debe ser un usuario real de Google Workspace autorizado con ` +
          `Domain-Wide Delegation.`
      );
    }

    const jwt = new JWT({
      email: key.client_email,
      key: key.private_key,
      subject: impersonated,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    });

    this.jwtByAccount.set(account.key, jwt);
    logger.info(
      `[GoogleMeet] Auth inicializado para cuenta "${account.key}" impersonando a ${impersonated}` +
        ` (calendar: ${account.calendarId})`
    );
    return jwt;
  }

  /** Devuelve la cuenta configurada para un consultor o lanza error. */
  resolveAccountForConsultorOrThrow(consultorId: string): CalendarAccountConfig {
    const account = calendarAccountRegistry.resolveForConsultor(consultorId);
    if (!account) {
      throw new Error(
        `No hay cuenta de Google Calendar configurada para el consultor ${consultorId}. ` +
          `Agrega su UUID a GOOGLE_CALENDAR_ACCOUNTS o desactiva STRICT_CALENDAR_ACCOUNTS ` +
          `si prefieres el fallback legacy.`
      );
    }
    return account;
  }

  /**
   * Consulta freebusy del calendario de la cuenta para detectar
   * conflictos reales en Google (además de la validación de BD).
   * Devuelve `true` si el rango está libre en Google Calendar.
   */
  async isSlotFreeInCalendar(
    consultorId: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    try {
      const account = this.resolveAccountForConsultorOrThrow(consultorId);
      const auth = await this.getAuthForAccount(account);
      const calendar = google.calendar({ version: 'v3', auth });
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          items: [{ id: account.calendarId }],
        },
      });
      const busy = res.data.calendars?.[account.calendarId]?.busy || [];
      return busy.length === 0;
    } catch (err: any) {
      // En caso de fallo de red o auth: devolvemos `true` para no
      // bloquear el agendado con un error transitorio de Google (la BD
      // sigue siendo el gate primario). Se registra para diagnóstico.
      logger.error(
        this.getGoogleErrorDebug(err),
        '[GoogleMeet] freebusy falló, se ignora el resultado y se confía en la validación de BD.'
      );
      return true;
    }
  }

  /**
   * Crea un evento en Google Calendar con Meet en la cuenta del
   * consultor. Devuelve `{ meetLink, eventId, calendarAccountKey }`.
   */
  async createEventForConsultor(params: {
    consultorId: string;
    consultantEmail: string;
    clientEmail: string;
    clientName: string;
    startTime: Date;
    endTime: Date;
  }): Promise<{ meetLink: string; eventId: string; calendarAccountKey: string }> {
    const account = this.resolveAccountForConsultorOrThrow(params.consultorId);
    const auth = await this.getAuthForAccount(account);
    const calendar = google.calendar({ version: 'v3', auth });

    const requestId = `ddl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const event = {
      summary: `Sesión estratégica · ${params.clientName}`,
      description:
        'Sesión exploratoria con Díaz Lara Consultores.\n' +
        'Asesoría fiscal, contable y financiera.',
      start: {
        dateTime: params.startTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      end: {
        dateTime: params.endTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      attendees: this.buildAttendees(
        params.consultantEmail,
        params.clientEmail,
        params.clientName
      ),
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    let response: any;
    try {
      logger.info(
        {
          accountKey: account.key,
          calendarId: account.calendarId,
          impersonatedUser: account.impersonateUser,
          serviceAccountEmail: this.serviceAccountEmail,
          requestId,
          event: {
            summary: event.summary,
            start: event.start,
            end: event.end,
            attendees: event.attendees.map((a) => a.email),
          },
        },
        '[GoogleMeet] Insertando evento en Google Calendar'
      );

      response = await calendar.events.insert({
        calendarId: account.calendarId,
        requestBody: event as any,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });
    } catch (apiErr: any) {
      const gMsg = this.getGoogleErrorMessage(apiErr);
      logger.error(
        this.getGoogleErrorDebug(apiErr),
        `[GoogleMeet] Error en events.insert para cuenta "${account.key}"`
      );
      if (gMsg.includes('Service accounts cannot invite attendees')) {
        throw new Error(
          `Google Calendar (cuenta ${account.key}): faltan permisos de Domain-Wide Delegation. ` +
            `Verifica que ${account.impersonateUser} sea un usuario real de Workspace y que el ` +
            `service account tenga delegación autorizada en Admin Console.`
        );
      }
      throw new Error(`Google Calendar API error (${account.key}): ${gMsg}`);
    }

    const meetLink =
      response.data.hangoutLink ||
      response.data.conferenceData?.entryPoints?.find(
        (e: any) => e.entryPointType === 'video'
      )?.uri;

    if (!meetLink) {
      throw new Error(
        `Evento creado en Google Calendar (cuenta ${account.key}) pero no se generó enlace de Meet.`
      );
    }
    if (!response.data.id) {
      throw new Error(
        `Evento creado en Google Calendar (cuenta ${account.key}) pero Google no devolvió eventId.`
      );
    }

    logger.info(
      `✓ Google Meet generado en cuenta "${account.key}" para ${params.clientEmail}: ${meetLink} (eventId=${response.data.id})`
    );

    return {
      meetLink,
      eventId: String(response.data.id),
      calendarAccountKey: account.key,
    };
  }

  /**
   * Cancela un evento previamente creado, usando la MISMA cuenta con la
   * que se creó (obligatorio: `accountKey` viene de la BD).
   */
  async cancelEvent(accountKey: string, eventId: string): Promise<void> {
    if (!accountKey || !eventId) return;
    const account = calendarAccountRegistry.getByKey(accountKey);
    if (!account) {
      logger.warn(
        `[GoogleMeet] No se puede cancelar eventId=${eventId}: cuenta "${accountKey}" no está configurada actualmente.`
      );
      return;
    }
    try {
      const auth = await this.getAuthForAccount(account);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.delete({
        calendarId: account.calendarId,
        eventId,
        sendUpdates: 'all',
      });
      logger.info(`[GoogleMeet] Evento ${eventId} cancelado en cuenta "${account.key}".`);
    } catch (err: any) {
      logger.error(
        this.getGoogleErrorDebug(err),
        `[GoogleMeet] No se pudo cancelar evento ${eventId} en cuenta "${account.key}".`
      );
    }
  }

  /**
   * Reprograma un evento existente (cambia fecha/hora). Devuelve el
   * nuevo Meet link — normalmente el mismo, pero puede regenerarse.
   */
  async rescheduleEvent(params: {
    accountKey: string;
    eventId: string;
    startTime: Date;
    endTime: Date;
  }): Promise<{ meetLink: string | null }> {
    const account = calendarAccountRegistry.getByKey(params.accountKey);
    if (!account) {
      throw new Error(
        `No se puede reprogramar: la cuenta "${params.accountKey}" no está configurada.`
      );
    }
    const auth = await this.getAuthForAccount(account);
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.patch({
      calendarId: account.calendarId,
      eventId: params.eventId,
      sendUpdates: 'all',
      requestBody: {
        start: { dateTime: params.startTime.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: params.endTime.toISOString(), timeZone: 'America/Mexico_City' },
      },
    });
    const meetLink =
      res.data.hangoutLink ||
      res.data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
      null;
    return { meetLink };
  }

  /**
   * @deprecated Compatibilidad. Usa `createEventForConsultor`.
   * Lanza para forzar el uso del método nuevo con `consultorId`.
   */
  async generateMeetLink(
    _consultantEmail: string,
    _clientEmail: string,
    _clientName: string,
    _startTime: Date,
    _endTime: Date
  ): Promise<string> {
    throw new Error(
      'generateMeetLink() está deprecado; usa createEventForConsultor({ consultorId, ... }).'
    );
  }

  /**
   * Verifica la conexión con cada cuenta configurada. Útil en el
   * arranque del servidor.
   */
  async testConnection(): Promise<void> {
    const accounts = calendarAccountRegistry.list();
    if (accounts.length === 0) {
      logger.warn('[GoogleMeet] No hay cuentas de calendario configuradas.');
      return;
    }
    for (const account of accounts) {
      try {
        const auth = await this.getAuthForAccount(account);
        const calendar = google.calendar({ version: 'v3', auth });
        await calendar.calendars.get({ calendarId: account.calendarId });
        logger.info(
          `✓ Google Calendar conectado: cuenta="${account.key}" user=${account.impersonateUser} calendarId=${account.calendarId}`
        );
      } catch (err: any) {
        const gMsg = this.getGoogleErrorMessage(err);
        logger.error(
          `✗ Falla de conexión a Google Calendar (cuenta "${account.key}"): ${gMsg}`
        );
      }
    }
  }
}

export const googleMeetService = new GoogleMeetService();

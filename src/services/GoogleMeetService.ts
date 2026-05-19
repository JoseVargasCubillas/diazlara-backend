/**
 * GoogleMeetService — crea eventos de Google Calendar con enlace de Meet.
 *
 * Para crear Meet como un usuario con GOOGLE_CALENDAR_ID=primary,
 * requiere Google Workspace y Domain-Wide Delegation.
 *
 * Necesitas:
 *   1. Service Account JSON/ruta/base64  →  GOOGLE_SERVICE_ACCOUNT_JSON
 *   2. Usuario Workspace a impersonar  →  GOOGLE_IMPERSONATE_USER
 *   3. ID del calendario (normalmente "primary")  →  GOOGLE_CALENDAR_ID
 *
 * Configuración .env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
 *   # O:
 *   GOOGLE_SERVICE_ACCOUNT_JSON=C:\ruta\service-account.json
 *   GOOGLE_IMPERSONATE_USER=contacto@diazlara.mx
 *   GOOGLE_CALENDAR_ID=primary
 */
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import { env } from '../config/environment';
import { logger } from '../config/logger';

class GoogleMeetService {
  private auth: JWT | null = null;
  private serviceAccountEmail: string | null = null;
  private impersonatedUser: string | undefined;

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

  private async initializeAuth(): Promise<JWT> {
    if (this.auth) return this.auth;

    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON no está configurado. ' +
        'Agrega el JSON del Service Account en el archivo .env.'
      );
    }

    if (!env.GOOGLE_CALENDAR_ID) {
      throw new Error(
        'GOOGLE_CALENDAR_ID no está configurado. ' +
        'Pon el email del dueño del calendario (ej: contacto@diazlara.mx) en .env, ' +
        'y comparte ese calendario con el email del Service Account como Editor.'
      );
    }

    const serviceAccountKey = this.parseServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    this.serviceAccountEmail = serviceAccountKey.client_email;

    const configuredImpersonatedUser = env.GOOGLE_IMPERSONATE_USER?.trim() || undefined;
    this.impersonatedUser =
      configuredImpersonatedUser &&
      configuredImpersonatedUser.toLowerCase() !== serviceAccountKey.client_email.toLowerCase()
        ? configuredImpersonatedUser
        : undefined;

    if (configuredImpersonatedUser && !this.impersonatedUser) {
      logger.warn(
        '[GoogleMeet] GOOGLE_IMPERSONATE_USER es igual al email del service account; ' +
        'se ignora porque no es una impersonación válida. Debe ser un usuario real de Google Workspace.'
      );
    }

    this.auth = new JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      subject: this.impersonatedUser,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    });

    logger.info(
      `Google Calendar auth inicializado con service account: ${serviceAccountKey.client_email}` +
      (this.impersonatedUser ? ` impersonando a ${this.impersonatedUser}` : '')
    );
    return this.auth;
  }

  /**
   * Crea un evento en Google Calendar con conferencia de Meet.
   * Devuelve la URL del Meet o lanza un error con detalle del problema.
   */
  async generateMeetLink(
    consultantEmail: string,
    clientEmail: string,
    clientName: string,
    startTime: Date,
    endTime: Date
  ): Promise<string> {
    const auth = await this.initializeAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const requestId = `ddl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const event = {
      summary: `Sesión estratégica · ${clientName}`,
      description:
        'Sesión exploratoria con Díaz Lara Consultores.\n' +
        'Asesoría fiscal, contable y financiera.',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      attendees: this.buildAttendees(consultantEmail, clientEmail, clientName),
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
      logger.info({
        calendarId: env.GOOGLE_CALENDAR_ID,
        serviceAccountEmail: this.serviceAccountEmail,
        impersonatedUser: this.impersonatedUser || null,
        hasDomainWideDelegationSubject: Boolean(this.impersonatedUser),
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestId,
        event: {
          summary: event.summary,
          start: event.start,
          end: event.end,
          attendees: event.attendees.map((attendee) => attendee.email),
          conferenceType: event.conferenceData.createRequest.conferenceSolutionKey.type,
        },
      }, '[GoogleMeet] Insertando evento en Google Calendar');

      response = await calendar.events.insert({
        calendarId: env.GOOGLE_CALENDAR_ID!,
        requestBody: event as any,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });

      logger.info({
        status: response.status,
        statusText: response.statusText,
        eventId: response.data?.id,
        htmlLink: response.data?.htmlLink,
        hangoutLink: response.data?.hangoutLink,
        conferenceData: response.data?.conferenceData,
        creator: response.data?.creator,
        organizer: response.data?.organizer,
      }, '[GoogleMeet] Respuesta de Google Calendar events.insert');
    } catch (apiErr: any) {
      // Extraer mensaje de error específico de Google para facilitar diagnóstico
      const gMsg = this.getGoogleErrorMessage(apiErr);
      logger.error(this.getGoogleErrorDebug(apiErr), '[GoogleMeet] Error completo de Google Calendar events.insert');
      if (gMsg.includes('Service accounts cannot invite attendees')) {
        throw new Error(
          'Google Calendar API error: Service accounts cannot invite attendees without Domain-Wide Delegation of Authority. ' +
          'Estás autenticando como service account, no como un usuario Workspace. ' +
          'GOOGLE_IMPERSONATE_USER debe ser un usuario real de Google Workspace autorizado con Domain-Wide Delegation; ' +
          'no puede ser el email del service account ni una cuenta Gmail personal.'
        );
      }
      if (gMsg.includes('Invalid conference type value')) {
        throw new Error(
          'Google Calendar API error: Invalid conference type value. ' +
          'El calendario acepta eventos, pero esta autenticación no puede crear enlaces de Meet. ' +
          'Usa un usuario Google Workspace con Domain-Wide Delegation en GOOGLE_IMPERSONATE_USER, ' +
          'o cambia la integración a OAuth de usuario.'
        );
      }
      throw new Error(`Google Calendar API error: ${gMsg}`);
    }

    const meetLink =
      response.data.hangoutLink ||
      response.data.conferenceData?.entryPoints?.find(
        (e: any) => e.entryPointType === 'video'
      )?.uri;

    if (!meetLink) {
      throw new Error(
        'Evento creado en Google Calendar pero no se generó enlace de Meet. ' +
        'Verifica que la Calendar API y Meet estén habilitados en Google Cloud Console.'
      );
    }

    logger.info(`✓ Google Meet generado para ${clientEmail}: ${meetLink}`);
    return meetLink;
  }

  /**
   * Verifica la conexión con Google Calendar.
   * Útil para diagnosticar en el arranque del servidor.
   */
  async testConnection(): Promise<void> {
    try {
      const auth = await this.initializeAuth();
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.calendars.get({ calendarId: env.GOOGLE_CALENDAR_ID! });
      logger.info(`✓ Google Calendar conectado: ${env.GOOGLE_CALENDAR_ID}`);
    } catch (err: any) {
      const gMsg = this.getGoogleErrorMessage(err);
      logger.error(`✗ Google Calendar connection test failed: ${gMsg}`);
      throw new Error(`Google Calendar no disponible: ${gMsg}`);
    }
  }
}

export const googleMeetService = new GoogleMeetService();

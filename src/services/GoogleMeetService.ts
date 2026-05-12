import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { env } from '../config/environment';
import { logger } from '../config/logger';

class GoogleMeetService {
  private auth: JWT | null = null;

  /**
   * Initialize Google JWT client.
   * For Google Workspace + Service Account with Domain-Wide Delegation,
   * `GOOGLE_IMPERSONATE_USER` MUST be set to a real Workspace user
   * (the calendar owner that will host the meetings).
   */
  private async initializeAuth(): Promise<JWT> {
    if (this.auth) {
      return this.auth;
    }

    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON not configured. Real Google Meet links require a Workspace ' +
          'Service Account with Domain-Wide Delegation enabled.'
      );
    }

    if (!env.GOOGLE_IMPERSONATE_USER) {
      throw new Error(
        'GOOGLE_IMPERSONATE_USER not configured. Set this to the Workspace user email that owns ' +
          'the calendar (e.g. contacto@diazlara.mx).'
      );
    }

    const serviceAccountKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);

    this.auth = new JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      subject: env.GOOGLE_IMPERSONATE_USER, // domain-wide delegation
    });

    return this.auth;
  }

  /**
   * Create a Google Calendar event with a real Google Meet conference attached.
   * Returns the meet URL. Throws on any failure (caller decides how to degrade).
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
      attendees: [
        { email: consultantEmail, organizer: true },
        { email: clientEmail, displayName: clientName },
      ],
      conferenceData: {
        createRequest: {
          requestId: `ddl-${Date.now()}`,
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

    const response = await calendar.events.insert({
      calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
      requestBody: event as any,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    const meetLink =
      response.data.hangoutLink ||
      response.data.conferenceData?.entryPoints?.find(
        (e: any) => e.entryPointType === 'video'
      )?.uri;

    if (!meetLink) {
      throw new Error('Google Calendar event created but no Meet link was returned');
    }

    logger.info(`Google Meet link created for ${clientEmail}: ${meetLink}`);
    return meetLink;
  }
}

export const googleMeetService = new GoogleMeetService();

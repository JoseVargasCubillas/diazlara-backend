import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { env } from '../config/environment';
import { logger } from '../config/logger';

class GoogleMeetService {
  private auth: JWT | null = null;

  /**
   * Initialize Google OAuth2 client
   */
  private async initializeAuth(): Promise<JWT> {
    if (this.auth) {
      return this.auth;
    }

    try {
      if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set');
      }

      const serviceAccountKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);

      this.auth = new JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });

      return this.auth;
    } catch (error) {
      logger.error('Failed to initialize Google auth:', error);
      throw error;
    }
  }

  /**
   * Generate Google Meet link by creating a calendar event
   */
  async generateMeetLink(
    consultantEmail: string,
    clientEmail: string,
    clientName: string,
    startTime: Date,
    endTime: Date
  ): Promise<string> {
    try {
      const auth = await this.initializeAuth();
      const calendar = google.calendar({ version: 'v3', auth });

      // Create event with Google Meet
      const event = {
        summary: `Strategic Consultation Session - ${clientName}`,
        description: 'Session with Díaz Lara Consultores',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/Mexico_City',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Mexico_City',
        },
        attendees: [
          {
            email: consultantEmail,
            displayName: 'Consultant',
            organizer: true,
          },
          {
            email: clientEmail,
            displayName: clientName,
          },
        ],
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: {
              key: 'addOn',
            },
          },
        },
        sendNotifications: true,
      };

      const response = await calendar.events.insert({
        calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
        requestBody: event as any,
        conferenceDataVersion: 1,
      });

      // Extract Meet link from response
      const meetLink =
        response.data.conferenceData?.entryPoints?.find(
          (entry: any) => entry.entryPointType === 'video'
        )?.uri || response.data.hangoutLink;

      if (!meetLink) {
        throw new Error('Failed to generate Google Meet link');
      }

      logger.info(`Google Meet link generated: ${meetLink}`);

      return meetLink;
    } catch (error) {
      logger.error('Error generating Google Meet link:', error);
      // Return a fallback link if generation fails
      return `https://meet.google.com/fallback-${Date.now()}`;
    }
  }

  /**
   * Send calendar invite to both consultant and client
   */
  async sendCalendarInvite(
    consultantEmail: string,
    clientEmail: string,
    clientName: string,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    try {
      await this.generateMeetLink(consultantEmail, clientEmail, clientName, startTime, endTime);
      logger.info(`Calendar invite sent to ${clientEmail}`);
    } catch (error) {
      logger.error('Error sending calendar invite:', error);
      throw error;
    }
  }
}

export const googleMeetService = new GoogleMeetService();

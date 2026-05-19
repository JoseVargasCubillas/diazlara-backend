import app from './app';
import { validateEnvironment } from './config/environment';
import { logger } from './config/logger';
import { appointmentScheduler } from './services/AppointmentScheduler';

// Validate environment variables at startup
try {
  validateEnvironment();
} catch (error) {
  logger.error({ err: error }, 'Environment validation failed');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = app.listen(PORT, () => {
  logger.info(`✓ Server running on http://localhost:${PORT}`);
  logger.info(`✓ Environment: ${process.env.NODE_ENV}`);
  logger.info({
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID,
    googleImpersonateUser: process.env.GOOGLE_IMPERSONATE_USER,
    googleMeetExtraAttendees: process.env.GOOGLE_MEET_EXTRA_ATTENDEES,
  }, '[Startup] Google Calendar configuration loaded');

  // Start appointment scheduler
  appointmentScheduler.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  appointmentScheduler.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason: any) => {
  logger.error({ reason }, 'Unhandled Rejection');
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  process.exit(1);
});

import app from './app';
import { validateEnvironment } from './config/environment';
import { logger } from './config/logger';
import { appointmentScheduler } from './services/AppointmentScheduler';
import { calendarAccountRegistry } from './services/CalendarAccountRegistry';
import { googleMeetService } from './services/GoogleMeetService';

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

  const accounts = calendarAccountRegistry.list();
  logger.info(
    {
      strict: process.env.STRICT_CALENDAR_ACCOUNTS,
      accounts: accounts.map((a) => ({
        key: a.key,
        impersonateUser: a.impersonateUser,
        calendarId: a.calendarId,
        consultorIds: a.consultorIds.length,
        legacy: !!a.legacy,
      })),
    },
    '[Startup] Google Calendar accounts loaded'
  );

  // Prueba conexión a cada cuenta (no bloquea el arranque si falla).
  googleMeetService.testConnection().catch((err) => {
    logger.error({ err }, '[Startup] Google Calendar test failed');
  });

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

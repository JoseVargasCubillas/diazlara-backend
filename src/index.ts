import app from './app';
import { validateEnvironment } from './config/environment';
import { logger } from './config/logger';
import { appointmentScheduler } from './services/AppointmentScheduler';

// Validate environment variables at startup
try {
  validateEnvironment();
} catch (error) {
  logger.error('Environment validation failed:', error);
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = app.listen(PORT, () => {
  logger.info(`✓ Server running on http://localhost:${PORT}`);
  logger.info(`✓ Environment: ${process.env.NODE_ENV}`);

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
  logger.error('Unhandled Rejection at:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

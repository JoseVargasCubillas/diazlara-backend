import cron from 'node-cron';
import { logger } from '../config/logger';
import { notificationService } from './NotificationService';

class AppointmentScheduler {
  private reminderJob: cron.ScheduledTask | null = null;
  private retryJob: cron.ScheduledTask | null = null;

  /**
   * Start the appointment scheduler
   * - Runs every 10 minutes to process pending reminders
   * - Runs daily at 2am to retry failed notifications
   */
  start(): void {
    try {
      // Process pending reminders every 10 minutes
      this.reminderJob = cron.schedule('*/10 * * * *', async () => {
        logger.debug('Running appointment reminder scheduler');
        try {
          await notificationService.processPendingReminders();
        } catch (error) {
          logger.error('Error processing reminders:', error);
        }
      });

      // Retry failed notifications daily at 2:15 AM
      this.retryJob = cron.schedule('15 2 * * *', async () => {
        logger.debug('Running failed notification retry scheduler');
        try {
          await notificationService.retryFailedNotifications();
        } catch (error) {
          logger.error('Error retrying failed notifications:', error);
        }
      });

      logger.info('Appointment scheduler started');
    } catch (error) {
      logger.error('Failed to start appointment scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop the appointment scheduler
   */
  stop(): void {
    try {
      if (this.reminderJob) {
        this.reminderJob.stop();
        this.reminderJob = null;
      }

      if (this.retryJob) {
        this.retryJob.stop();
        this.retryJob = null;
      }

      logger.info('Appointment scheduler stopped');
    } catch (error) {
      logger.error('Failed to stop appointment scheduler:', error);
    }
  }
}

export const appointmentScheduler = new AppointmentScheduler();

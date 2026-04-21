import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { SlotInfo } from '../types';
import { addMinutes, format } from 'date-fns';

interface SlotCalculationOptions {
  duration?: 15 | 30 | 60; // minutes
  timezone?: string;
}

export class SlotCalculatorService {
  /**
   * Get available 15-minute slots for a consultant on a specific date
   */
  async getAvailableSlots(
    consultorId: string,
    fecha: Date,
    options: SlotCalculationOptions = {}
  ): Promise<SlotInfo[]> {
    const { duration = 15 } = options;

    try {
      const pool = await getDatabase();

      // Get consultant's availability for this day of week
      const dayOfWeek = fecha.getUTCDay();
      const [availRows] = await pool.execute(
        `SELECT hora_inicio, hora_fin FROM DISPONIBILIDAD
         WHERE consultor_id = ? AND dia_semana = ? AND activo = 1`,
        [consultorId, dayOfWeek]
      );

      if (!Array.isArray(availRows) || availRows.length === 0) {
        return []; // No availability for this day
      }

      const availability = availRows[0] as any;
      const startTime = availability.hora_inicio; // HH:MM:SS
      const endTime = availability.hora_fin;

      // Get blocks for this date
      const [blockRows] = await pool.execute(
        `SELECT inicio, fin FROM BLOQUEOS
         WHERE consultor_id = ?
         AND DATE(inicio) <= DATE(?)
         AND DATE(fin) >= DATE(?)`,
        [consultorId, fecha, fecha]
      );

      const blocks = (blockRows as any[]) || [];

      // Get existing appointments for this date
      const [citasRows] = await pool.execute(
        `SELECT fecha_hora_inicio, fecha_hora_fin FROM CITAS
         WHERE consultor_id = ?
         AND DATE(fecha_hora_inicio) = DATE(?)
         AND estado IN ('pendiente', 'confirmada')`,
        [consultorId, fecha]
      );

      const citas = (citasRows as any[]) || [];

      // Generate slots
      const slots: SlotInfo[] = [];
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);

      let currentSlotStart = new Date(fecha);
      currentSlotStart.setUTCHours(startHour, startMin, 0, 0);

      const dayEnd = new Date(fecha);
      dayEnd.setUTCHours(endHour, endMin, 0, 0);

      while (currentSlotStart < dayEnd) {
        const slotEnd = addMinutes(currentSlotStart, duration);

        // Check if slot overlaps with any block
        const isBlocked = blocks.some((block: any) => {
          const blockStart = new Date(block.inicio);
          const blockEnd = new Date(block.fin);
          return currentSlotStart < blockEnd && slotEnd > blockStart;
        });

        // Check if slot overlaps with any appointment
        const hasAppointment = citas.some((cita: any) => {
          const citaStart = new Date(cita.fecha_hora_inicio);
          const citaEnd = new Date(cita.fecha_hora_fin);
          return currentSlotStart < citaEnd && slotEnd > citaStart;
        });

        const disponible = !isBlocked && !hasAppointment;

        slots.push({
          inicio: currentSlotStart.toISOString(),
          fin: slotEnd.toISOString(),
          disponible,
          razon: isBlocked ? 'blocked' : hasAppointment ? 'appointment' : undefined,
        });

        currentSlotStart = slotEnd;
      }

      logger.info(`Generated ${slots.length} slots for consultant ${consultorId} on ${format(fecha, 'yyyy-MM-dd')}`);

      return slots;
    } catch (error) {
      logger.error('Error calculating slots:', error);
      throw error;
    }
  }

  /**
   * Check if a specific time slot is available
   */
  async isSlotAvailable(
    consultorId: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    try {
      const pool = await getDatabase();

      // Check for overlapping appointments
      const [citasRows] = await pool.execute(
        `SELECT id FROM CITAS
         WHERE consultor_id = ?
         AND estado IN ('pendiente', 'confirmada')
         AND fecha_hora_inicio < ?
         AND fecha_hora_fin > ?`,
        [consultorId, endTime, startTime]
      );

      if (Array.isArray(citasRows) && citasRows.length > 0) {
        return false;
      }

      // Check for blocks
      const [blockRows] = await pool.execute(
        `SELECT id FROM BLOQUEOS
         WHERE consultor_id = ?
         AND inicio < ?
         AND fin > ?`,
        [consultorId, endTime, startTime]
      );

      if (Array.isArray(blockRows) && blockRows.length > 0) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking slot availability:', error);
      throw error;
    }
  }

  /**
   * Get next N available dates with slot counts
   */
  async getNextAvailableDates(
    consultorId: string,
    startDate: Date,
    daysAhead: number = 30
  ): Promise<{ date: Date; slotCount: number }[]> {
    try {
      const results: { date: Date; slotCount: number }[] = [];
      let currentDate = new Date(startDate);

      for (let i = 0; i < daysAhead; i++) {
        const slots = await this.getAvailableSlots(consultorId, currentDate);
        const availableSlots = slots.filter(s => s.disponible).length;

        if (availableSlots > 0) {
          results.push({
            date: new Date(currentDate),
            slotCount: availableSlots,
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return results;
    } catch (error) {
      logger.error('Error getting next available dates:', error);
      throw error;
    }
  }
}

export const slotCalculatorService = new SlotCalculatorService();

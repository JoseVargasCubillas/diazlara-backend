import axios from 'axios';
import { logger } from '../config/logger';
import { ValidationError } from '../types';

interface SyncLeadData {
  leadId: string;
  nombre: string;
  email: string;
  telefono_whatsapp?: string;
  empresa?: string;
  puesto?: string;
  servicios?: string[];
  consultorId?: string;
}

class ConsultoriaIntegrationService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.CONSULTORIA_API_URL || 'http://localhost:3001';
    this.apiKey = process.env.CONSULTORIA_API_KEY || '';
  }

  /**
   * Sincronizar un lead aprobado a Consultoria como cliente
   */
  async syncLeadToConsultoria(leadData: SyncLeadData): Promise<any> {
    try {
      if (!this.apiKey) {
        throw new ValidationError(
          'Consultoria API key not configured',
          { configuration: 'CONSULTORIA_API_KEY is not set' }
        );
      }

      // Preparar datos para Consultoria API
      // El modelo de Cliente en Consultoria espera: firstName, lastName, email, phone, regimenFiscal, serviceId
      const consultoriaPayload = {
        firstName: leadData.nombre.split(' ')[0],
        lastName: leadData.nombre.split(' ').slice(1).join(' ') || 'N/A',
        email: leadData.email,
        phone: leadData.telefono_whatsapp || '',
        regimenFiscal: 'PFE', // Default - puede cambiar según servicios
        serviceType: this.mapServicesToServiceType(leadData.servicios),
        empresa: leadData.empresa || '',
        puesto: leadData.puesto || '',
        consultorId: leadData.consultorId,
        diazlaraLeadId: leadData.leadId, // Referencia cruzada
      };

      const response = await axios.post(
        `${this.baseUrl}/api/clientes/sincronizar-lead`,
        consultoriaPayload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      logger.info(`Lead synced to Consultoria: ${leadData.leadId} -> Client ${response.data.data?.id}`);

      return {
        success: true,
        clienteId: response.data.data?.id,
        mensaje: 'Cliente creado en Consultoria exitosamente',
      };
    } catch (error) {
      logger.error('Error syncing lead to Consultoria:', error);

      if (axios.isAxiosError(error)) {
        throw new ValidationError(
          'Error syncing to Consultoria platform',
          {
            consultoria: error.response?.data?.message || error.message,
          }
        );
      }

      throw error;
    }
  }

  /**
   * Enviar zoom link a cliente en Consultoria
   */
  async sendZoomLinkToConsultoria(clienteId: number, zoomLink: string): Promise<any> {
    try {
      if (!this.apiKey) {
        throw new ValidationError(
          'Consultoria API key not configured',
          { configuration: 'CONSULTORIA_API_KEY is not set' }
        );
      }

      const response = await axios.patch(
        `${this.baseUrl}/api/clientes/${clienteId}/zoom-link`,
        { zoomLink },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      logger.info(`Zoom link sent to Consultoria client ${clienteId}`);

      return response.data;
    } catch (error) {
      logger.error('Error sending zoom link to Consultoria:', error);

      if (axios.isAxiosError(error)) {
        throw new ValidationError(
          'Error sending zoom link to Consultoria',
          {
            consultoria: error.response?.data?.message || error.message,
          }
        );
      }

      throw error;
    }
  }

  /**
   * Mapear servicios de diazlara a tipo de servicio en Consultoria
   */
  private mapServicesToServiceType(servicios?: string[]): string {
    if (!servicios || servicios.length === 0) {
      return 'impuestos'; // Default
    }

    const servicioMap: Record<string, string> = {
      'Impuestos y planeación fiscal': 'impuestos',
      'Estudios de precios de transferencia': 'precios',
      'Contabilidad y nómina': 'contabilidad',
      'Corporativo y derecho empresarial': 'corporativo',
      'Diagnóstico para metodologías': 'diagnostico',
      'Planeación patrimonial y holding': 'patrimonial',
      'Consultoría financiera': 'financiera',
    };

    // Usar el primer servicio mapeado disponible
    for (const servicio of servicios) {
      if (servicioMap[servicio]) {
        return servicioMap[servicio];
      }
    }

    return 'impuestos'; // Default fallback
  }

  /**
   * Verificar conexión con Consultoria
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/health`,
        {
          timeout: 5000,
        }
      );

      return response.status === 200;
    } catch (error) {
      logger.error('Consultoria connection test failed:', error);
      return false;
    }
  }
}

export const consultoriaIntegrationService = new ConsultoriaIntegrationService();

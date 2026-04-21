import axios from 'axios';
import { env } from '../config/environment';
import { logger } from '../config/logger';

interface HubSpotContact {
  email: string;
  firstname: string;
  lastname?: string;
  phone?: string;
  company?: string;
  jobtitle?: string;
}

interface HubSpotDeal {
  dealname: string;
  hubspot_owner_id?: string;
  dealstage: string;
  amount?: number;
  closedate?: number;
}

class HubSpotService {
  private apiKey: string;
  private baseUrl = 'https://api.hubapi.com';

  constructor() {
    this.apiKey = env.HUBSPOT_PRIVATE_APP_TOKEN || '';
  }

  /**
   * Create or update contact in HubSpot
   */
  async syncContact(clientData: {
    email: string;
    nombre: string;
    apellido?: string;
    telefono_whatsapp?: string;
    empresa?: string;
    puesto?: string;
  }): Promise<string | null> {
    try {
      if (!this.apiKey) {
        logger.warn('HubSpot API key not configured, skipping contact sync');
        return null;
      }

      const contactData: HubSpotContact = {
        email: clientData.email,
        firstname: clientData.nombre,
        lastname: clientData.apellido,
        phone: clientData.telefono_whatsapp,
        company: clientData.empresa,
        jobtitle: clientData.puesto,
      };

      // Check if contact exists
      const existingContact = await this.getContactByEmail(clientData.email);

      if (existingContact) {
        // Update existing contact
        await axios.patch(
          `${this.baseUrl}/crm/v3/objects/contacts/${existingContact}`,
          {
            properties: Object.entries(contactData)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([name, value]) => ({
                name,
                value: String(value),
              })),
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        logger.info(`HubSpot contact updated: ${clientData.email} (ID: ${existingContact})`);
        return existingContact;
      } else {
        // Create new contact
        const response = await axios.post(
          `${this.baseUrl}/crm/v3/objects/contacts`,
          {
            properties: Object.entries(contactData)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([name, value]) => ({
                name,
                value: String(value),
              })),
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const contactId = response.data.id;
        logger.info(`HubSpot contact created: ${clientData.email} (ID: ${contactId})`);
        return contactId;
      }
    } catch (error) {
      logger.error('Error syncing HubSpot contact:', error);
      return null;
    }
  }

  /**
   * Get contact ID by email
   */
  async getContactByEmail(email: string): Promise<string | null> {
    try {
      if (!this.apiKey) {
        return null;
      }

      const response = await axios.get(
        `${this.baseUrl}/crm/v3/objects/contacts`,
        {
          params: {
            limit: 1,
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'email',
                    operator: 'EQ',
                    value: email,
                  },
                ],
              },
            ],
          },
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      const contacts = response.data.results || [];
      return contacts.length > 0 ? contacts[0].id : null;
    } catch (error) {
      logger.debug('Contact not found in HubSpot:', error);
      return null;
    }
  }

  /**
   * Create deal/opportunity in HubSpot for appointment
   */
  async createAppointmentDeal(
    contactId: string,
    appointmentData: {
      cliente_nombre: string;
      fecha_hora_inicio: Date;
      consultor_nombre: string;
      servicios?: string[];
    }
  ): Promise<string | null> {
    try {
      if (!this.apiKey) {
        logger.warn('HubSpot API key not configured, skipping deal creation');
        return null;
      }

      const dealData: HubSpotDeal = {
        dealname: `Consultation - ${appointmentData.cliente_nombre} (${appointmentData.consultor_nombre})`,
        dealstage: 'negotiation',
        closedate: new Date(appointmentData.fecha_hora_inicio).getTime(),
      };

      const response = await axios.post(
        `${this.baseUrl}/crm/v3/objects/deals`,
        {
          properties: Object.entries(dealData)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([name, value]) => ({
              name,
              value: String(value),
            })),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const dealId = response.data.id;

      // Associate deal with contact
      await axios.put(
        `${this.baseUrl}/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}`,
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationType: 'deal_to_contact',
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`HubSpot deal created: ${dealId} for contact ${contactId}`);
      return dealId;
    } catch (error) {
      logger.error('Error creating HubSpot deal:', error);
      return null;
    }
  }

  /**
   * Update deal with qualification result
   */
  async updateDealQualification(
    dealId: string,
    qualification: {
      resultado: 'caliente' | 'tibio' | 'frio' | 'no_aplica';
      score_interes: 'alto' | 'medio' | 'bajo';
    }
  ): Promise<boolean> {
    try {
      if (!this.apiKey) {
        logger.warn('HubSpot API key not configured, skipping deal update');
        return false;
      }

      // Map qualification result to HubSpot deal stage
      const stageMap: Record<string, string> = {
        caliente: 'presentationscheduled',
        tibio: 'qualificationsentered',
        frio: 'closedlost',
        no_aplica: 'opportunityqualificationstage',
      };

      const properties = [
        {
          name: 'dealstage',
          value: stageMap[qualification.resultado] || 'qualificationsentered',
        },
        {
          name: 'hs_lead_status',
          value: qualification.resultado,
        },
        {
          name: 'hs_priority',
          value: qualification.score_interes === 'alto' ? 'high' : qualification.score_interes === 'medio' ? 'medium' : 'low',
        },
      ];

      await axios.patch(
        `${this.baseUrl}/crm/v3/objects/deals/${dealId}`,
        {
          properties,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`HubSpot deal updated: ${dealId} with qualification ${qualification.resultado}`);
      return true;
    } catch (error) {
      logger.error('Error updating HubSpot deal:', error);
      return false;
    }
  }

  /**
   * Sync qualification to HubSpot (full flow)
   */
  async syncQualification(
    clientData: {
      email: string;
      nombre: string;
      apellido?: string;
      telefono_whatsapp?: string;
      empresa?: string;
      puesto?: string;
    },
    qualification: {
      resultado: 'caliente' | 'tibio' | 'frio' | 'no_aplica';
      score_interes: 'alto' | 'medio' | 'bajo';
    },
    appointmentData: {
      cliente_nombre: string;
      fecha_hora_inicio: Date;
      consultor_nombre: string;
    }
  ): Promise<boolean> {
    try {
      if (!this.apiKey) {
        logger.warn('HubSpot API key not configured, skipping qualification sync');
        return false;
      }

      // Sync or update contact
      const contactId = await this.syncContact(clientData);
      if (!contactId) {
        return false;
      }

      // Check if deal exists for this contact
      const existingDealId = await this.findDealByContact(contactId);

      if (existingDealId) {
        // Update existing deal
        return await this.updateDealQualification(existingDealId, qualification);
      } else {
        // Create new deal
        const dealId = await this.createAppointmentDeal(contactId, appointmentData);
        if (!dealId) {
          return false;
        }

        // Update deal with qualification
        return await this.updateDealQualification(dealId, qualification);
      }
    } catch (error) {
      logger.error('Error syncing qualification to HubSpot:', error);
      return false;
    }
  }

  /**
   * Find deal associated with a contact
   */
  async findDealByContact(contactId: string): Promise<string | null> {
    try {
      if (!this.apiKey) {
        return null;
      }

      const response = await axios.get(
        `${this.baseUrl}/crm/v3/objects/contacts/${contactId}/associations/deals`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      const deals = response.data.results || [];
      return deals.length > 0 ? deals[0].id : null;
    } catch (error) {
      logger.debug('No deals found for contact:', error);
      return null;
    }
  }
}

export const hubspotService = new HubSpotService();

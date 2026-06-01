import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../config/logger';

interface DiazLaraClientData {
  id?: string;
  leadId?: string;
  nombre: string;
  apellido?: string;
  email: string;
  telefono_whatsapp?: string;
  empresa?: string;
  puesto?: string;
  servicios?: string[];
  fecha_registro?: string;
  importe_total?: number | string;
  ene?: number | string;
  feb?: number | string;
  mar?: number | string;
  abr?: number | string;
  may?: number | string;
  jun?: number | string;
  jul?: number | string;
  ago?: number | string;
  sep?: number | string;
  oct?: number | string;
  nov?: number | string;
  dic?: number | string;
  consultorId?: string;
}

export interface ConsultoriaSyncResult {
  success: boolean;
  clienteId?: number | string;
  mensaje: string;
  pendingRetry?: boolean;
  error?: string;
  existing?: boolean;
}

interface ConsultoriaRetryEntry {
  createdAt?: string;
  source?: string;
  error?: string;
  diazlaraClientId?: string;
  diazlaraLeadId?: string;
  email?: string;
  payload?: Record<string, unknown>;
  attempts?: number;
  lastAttemptAt?: string;
}

interface ConsultoriaRetrySummary {
  processed: number;
  synced: number;
  failed: number;
  skipped: number;
  remaining: number;
  results: Array<{
    email?: string;
    diazlaraClientId?: string;
    diazlaraLeadId?: string;
    success: boolean;
    skipped?: boolean;
    clienteId?: number | string;
    error?: string;
    existing?: boolean;
  }>;
}

class ConsultoriaIntegrationService {
  private baseUrl: string;
  private email: string;
  private password: string;
  private serviceType: string;
  private retryFilePath: string;
  private accessToken: string | null = null;

  constructor() {
    this.baseUrl = this.normalizeBaseUrl(process.env.CONSULTORIA_API_URL || '');
    this.email = process.env.CONSULTORIA_EMAIL || '';
    this.password = process.env.CONSULTORIA_PASSWORD || '';
    this.serviceType = process.env.CONSULTORIA_SERVICE_TYPE || 'asesoria_fiscal';
    this.retryFilePath = path.resolve(
      process.env.CONSULTORIA_SYNC_RETRY_FILE || path.join(process.cwd(), 'logs', 'consultoria-sync-failures.jsonl')
    );
  }

  async syncLeadToConsultoria(leadData: DiazLaraClientData): Promise<ConsultoriaSyncResult> {
    return this.syncClientToConsultoria(leadData, 'lead');
  }

  async syncManualClientToConsultoria(clientData: DiazLaraClientData): Promise<ConsultoriaSyncResult> {
    return this.syncClientToConsultoria(clientData, 'manual_client');
  }

  async findClientByEmail(clientData: DiazLaraClientData): Promise<ConsultoriaSyncResult | null> {
    if (!this.isConfigured() || !clientData.email) return null;

    const serviceType = this.mapServicesToServiceType(clientData.servicios);
    const existingClient = await this.findExistingClientByEmail(String(clientData.email), serviceType);
    if (!existingClient) return null;

    return {
      success: true,
      clienteId: existingClient.id,
      mensaje: 'Cliente ya existia en Consultoria',
      existing: true,
    };
  }

  async sendMeetLinkToConsultoria(clienteId: number | string, meetLink: string): Promise<any> {
    if (!this.isConfigured()) {
      logger.warn('Consultoria integration is not configured; skipping Meet link sync.');
      return { success: false, skipped: true };
    }

    const token = await this.getAccessToken();
    const response = await axios.patch(
      `${this.baseUrl}/api/clients/${clienteId}/meet-link`,
      { meetLink },
      {
        headers: this.authHeaders(token),
        timeout: 10000,
      }
    );

    return response.data;
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      await this.getAccessToken();
      return true;
    } catch (error) {
      logger.error('Consultoria connection test failed:', error);
      return false;
    }
  }

  async retryFailedSyncs(): Promise<ConsultoriaRetrySummary> {
    const entries = await this.readRetryEntries();
    const results: ConsultoriaRetrySummary['results'] = [];
    const remainingEntries: ConsultoriaRetryEntry[] = [];

    let processed = 0;
    let synced = 0;
    let failed = 0;
    let skipped = 0;

    if (entries.length === 0) {
      return { processed, synced, failed, skipped, remaining: 0, results };
    }

    if (!this.isConfigured()) {
      return {
        processed: 0,
        synced: 0,
        failed: entries.length,
        skipped: entries.length,
        remaining: entries.length,
        results: entries.map((entry) => ({
          email: entry.email,
          diazlaraClientId: entry.diazlaraClientId,
          diazlaraLeadId: entry.diazlaraLeadId,
          success: false,
          skipped: true,
          error: 'Consultoria integration is not configured.',
        })),
      };
    }

    for (const entry of entries) {
      if (!entry.payload) {
        skipped += 1;
        remainingEntries.push({
          ...entry,
          error: 'Retry entry does not contain a payload.',
          lastAttemptAt: new Date().toISOString(),
        });
        results.push({
          email: entry.email,
          diazlaraClientId: entry.diazlaraClientId,
          diazlaraLeadId: entry.diazlaraLeadId,
          success: false,
          skipped: true,
          error: 'Retry entry does not contain a payload.',
        });
        continue;
      }

      processed += 1;

      try {
        const token = await this.getAccessToken();
        const payload = this.sanitizeStoredPayload(entry.payload, entry);
        const existingClient = await this.findExistingClientByPayload(payload, token);
        if (existingClient) {
          synced += 1;
          results.push({
            email: entry.email,
            diazlaraClientId: entry.diazlaraClientId,
            diazlaraLeadId: entry.diazlaraLeadId,
            success: true,
            clienteId: existingClient.id,
            existing: true,
          });
          continue;
        }

        const result = await this.postClient(payload, token);
        const clienteId = result?.data?.id || result?.id;
        synced += 1;
        results.push({
          email: entry.email,
          diazlaraClientId: entry.diazlaraClientId,
          diazlaraLeadId: entry.diazlaraLeadId,
          success: true,
          clienteId,
        });
      } catch (error) {
        const normalizedError = this.getErrorMessage(error);
        failed += 1;
        remainingEntries.push({
          ...entry,
          error: normalizedError,
          attempts: Number(entry.attempts || 0) + 1,
          lastAttemptAt: new Date().toISOString(),
        });
        results.push({
          email: entry.email,
          diazlaraClientId: entry.diazlaraClientId,
          diazlaraLeadId: entry.diazlaraLeadId,
          success: false,
          error: normalizedError,
        });
      }
    }

    await this.writeRetryEntries(remainingEntries);

    return {
      processed,
      synced,
      failed,
      skipped,
      remaining: remainingEntries.length,
      results,
    };
  }

  private async syncClientToConsultoria(
    clientData: DiazLaraClientData,
    source: 'lead' | 'manual_client'
  ): Promise<ConsultoriaSyncResult> {
    const payload = this.buildClientPayload(clientData);

    if (!this.isConfigured()) {
      const message = 'Consultoria integration is not configured.';
      await this.recordFailedSync(source, clientData, payload, message);
      logger.warn(message);
      return { success: false, mensaje: message, pendingRetry: true, error: message };
    }

    try {
      const token = await this.getAccessToken();
      const existingClient = await this.findExistingClientByPayload(payload, token);
      if (existingClient) {
        return {
          success: true,
          clienteId: existingClient.id,
          mensaje: 'Cliente ya existia en Consultoria',
          existing: true,
        };
      }

      const result = await this.postClient(payload, token);
      const clienteId = result?.data?.id || result?.id;

      logger.info({
        diazLaraClientId: clientData.id,
        diazLaraLeadId: clientData.leadId,
        consultoriaClienteId: clienteId,
      }, 'Client synced to Consultoria');

      return {
        success: true,
        clienteId,
        mensaje: 'Cliente creado en Consultoria exitosamente',
      };
    } catch (error) {
      const token = this.accessToken || await this.getAccessToken().catch(() => null);
      const existingClient = token ? await this.findExistingClientByPayload(payload, token).catch(() => null) : null;
      if (existingClient && this.isDuplicateClientError(error)) {
        return {
          success: true,
          clienteId: existingClient.id,
          mensaje: 'Cliente ya existia en Consultoria',
          existing: true,
        };
      }

      const normalizedError = this.getErrorMessage(error);
      await this.recordFailedSync(source, clientData, payload, normalizedError);
      logger.warn({
        err: normalizedError,
        diazLaraClientId: clientData.id,
        diazLaraLeadId: clientData.leadId,
      }, 'Could not sync client to Consultoria; queued for retry');

      return {
        success: false,
        mensaje: 'Cliente local creado; sincronizacion con Consultoria pendiente.',
        pendingRetry: true,
        error: normalizedError,
      };
    }
  }

  private async postClient(payload: Record<string, unknown>, token: string): Promise<any> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/clients`, payload, {
        headers: this.authHeaders(token),
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.accessToken = null;
        const refreshedToken = await this.getAccessToken();
        const retryResponse = await axios.post(`${this.baseUrl}/api/clients`, payload, {
          headers: this.authHeaders(refreshedToken),
          timeout: 15000,
        });
        return retryResponse.data;
      }

      throw error;
    }
  }

  private async findExistingClientByPayload(payload: Record<string, unknown>, token: string): Promise<any | null> {
    const email = String(payload.email || '').trim();
    const serviceType = this.normalizeServiceType(String(payload.serviceType || this.serviceType));
    if (!email) return null;

    return this.findExistingClientByEmail(email, serviceType, token);
  }

  private async findExistingClientByEmail(email: string, serviceType: string, token?: string): Promise<any | null> {
    const accessToken = token || await this.getAccessToken();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return null;

    const serviceId = await this.getServiceIdByType(serviceType, accessToken);
    const response = await axios.get(`${this.baseUrl}/api/clients`, {
      headers: this.authHeaders(accessToken),
      params: {
        ...(serviceId !== null ? { serviceId } : {}),
        limit: 1000,
        isClient: true,
      },
      timeout: 15000,
    });

    const clients = this.extractClients(response.data);
    return clients.find((client) => {
      if (!this.sameEmail(client?.email, cleanEmail)) return false;
      if (serviceId === null) return true;
      return Number(client?.serviceId || client?.service_id || client?.service?.id) === Number(serviceId);
    }) || null;
  }

  private async getServiceIdByType(serviceType: string, token: string): Promise<number | null> {
    const response = await axios.get(`${this.baseUrl}/api/clients/services`, {
      headers: this.authHeaders(token),
      timeout: 10000,
    });

    const services = this.extractList(response.data);
    const service = services.find((item) => String(item?.type || item?.value || '').trim() === serviceType);
    const id = Number(service?.id);
    return Number.isFinite(id) ? id : null;
  }

  private extractClients(responseData: any): any[] {
    const data = responseData?.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.clients)) return data.clients;
    if (Array.isArray(responseData?.clients)) return responseData.clients;
    return [];
  }

  private extractList(responseData: any): any[] {
    if (Array.isArray(responseData)) return responseData;
    if (Array.isArray(responseData?.data)) return responseData.data;
    return [];
  }

  private sameEmail(value: unknown, expectedEmail: string): boolean {
    return String(value || '').trim().toLowerCase() === expectedEmail;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    let response;
    try {
      response = await axios.post(
        `${this.baseUrl}/api/auth/login`,
        {
          email: this.email,
          password: this.password,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );
    } catch (error) {
      throw new Error(`Consultoria login failed: ${this.getErrorMessage(error)}`);
    }

    const token = response.data?.data?.accessToken || response.data?.accessToken || response.data?.token;
    if (!token) {
      throw new Error('Consultoria login did not return an access token.');
    }

    this.accessToken = token;
    return token;
  }

  private buildClientPayload(clientData: DiazLaraClientData): Record<string, unknown> {
    const firstName = String(clientData.nombre || '').trim();
    const lastName = String(clientData.apellido || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const currentYear = new Date().getFullYear();

    return {
      firstName,
      lastName,
      email: String(clientData.email || '').trim(),
      phone: clientData.telefono_whatsapp || '',
      registrationDate: this.toIsoDate(clientData.fecha_registro),
      regimenFiscal: process.env.CONSULTORIA_REGIMEN_FISCAL || 'General de Ley Personas Morales',
      serviceType: this.mapServicesToServiceType(clientData.servicios),
      serviceYear: currentYear,
      isClient: true,
      empresas: [
        {
          companyName: this.toUniqueCompanyName(clientData.empresa || fullName || 'NA', clientData.id || clientData.email),
          empresaRfc: '',
          facturacion: {
            metaAnual: this.toMoney(clientData.importe_total),
            enero: this.toMoney(clientData.ene),
            febrero: this.toMoney(clientData.feb),
            marzo: this.toMoney(clientData.mar),
            abril: this.toMoney(clientData.abr),
            mayo: this.toMoney(clientData.may),
            junio: this.toMoney(clientData.jun),
            julio: this.toMoney(clientData.jul),
            agosto: this.toMoney(clientData.ago),
            septiembre: this.toMoney(clientData.sep),
            octubre: this.toMoney(clientData.oct),
            noviembre: this.toMoney(clientData.nov),
            diciembre: this.toMoney(clientData.dic),
          },
        },
      ],
    };
  }

  private mapServicesToServiceType(servicios?: string[]): string {
    if (!servicios || servicios.length === 0) return this.serviceType;

    const serviceMap: Array<[RegExp, string]> = [
      [/fiscal|impuesto/i, 'asesoria_fiscal'],
      [/dd|diego|due diligence/i, 'asesoria_con_diego'],
      [/cobrar/i, 'asesoria_como_cobrar'],
      [/holding|patrimonial/i, 'asesoria_holding'],
      [/diagn[oó]stico/i, 'diagnostico_fiscal'],
      [/tributaria/i, 'consultoria_tributaria'],
      [/cierre/i, 'cierre_del_ejercicio'],
      [/ept|precios de transferencia/i, 'ept'],
    ];

    const match = servicios
      .map((service) => serviceMap.find(([pattern]) => pattern.test(service))?.[1])
      .find(Boolean);

    return match || this.serviceType;
  }

  private async recordFailedSync(
    source: string,
    clientData: DiazLaraClientData,
    payload: Record<string, unknown>,
    error: string
  ): Promise<void> {
    const entry = {
      createdAt: new Date().toISOString(),
      source,
      error,
      diazlaraClientId: clientData.id,
      diazlaraLeadId: clientData.leadId,
      email: clientData.email,
      payload,
    };

    try {
      await fs.mkdir(path.dirname(this.retryFilePath), { recursive: true });
      await fs.appendFile(this.retryFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (writeError) {
      logger.error({ err: writeError, entry }, 'Could not record Consultoria sync retry entry');
    }
  }

  private async readRetryEntries(): Promise<ConsultoriaRetryEntry[]> {
    try {
      const raw = await fs.readFile(this.retryFilePath, 'utf8');
      return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as ConsultoriaRetryEntry;
          } catch (error) {
            logger.warn({ err: error, line }, 'Invalid Consultoria retry entry ignored');
            return null;
          }
        })
        .filter((entry): entry is ConsultoriaRetryEntry => Boolean(entry));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async writeRetryEntries(entries: ConsultoriaRetryEntry[]): Promise<void> {
    await fs.mkdir(path.dirname(this.retryFilePath), { recursive: true });
    const content = entries.map((entry) => JSON.stringify(entry)).join('\n');
    await fs.writeFile(this.retryFilePath, content ? `${content}\n` : '', 'utf8');
  }

  private sanitizeStoredPayload(payload: Record<string, unknown>, entry: ConsultoriaRetryEntry): Record<string, unknown> {
    const sanitized = { ...payload };
    delete sanitized.diazlaraClientId;
    delete sanitized.diazlaraLeadId;
    sanitized.serviceType = this.normalizeServiceType(String(sanitized.serviceType || this.serviceType));
    sanitized.registrationDate = this.toIsoDate(sanitized.registrationDate as string);

    const empresas = Array.isArray(sanitized.empresas) ? sanitized.empresas : [];
    sanitized.empresas = empresas.map((empresa) => {
      if (!empresa || typeof empresa !== 'object') return empresa;

      const empresaPayload = { ...(empresa as Record<string, unknown>) };
      empresaPayload.companyName = this.toUniqueCompanyName(
        String(empresaPayload.companyName || 'NA'),
        entry.diazlaraClientId || entry.email
      );
      const facturacion = empresaPayload.facturacion;

      if (facturacion && typeof facturacion === 'object') {
        const facturacionPayload = { ...(facturacion as Record<string, unknown>) };
        Object.keys(facturacionPayload).forEach((key) => {
          facturacionPayload[key] = this.toMoney(facturacionPayload[key] as number | string);
        });
        empresaPayload.facturacion = facturacionPayload;
      }

      return empresaPayload;
    });

    return sanitized;
  }

  private normalizeServiceType(serviceType: string): string {
    const serviceTypeMap: Record<string, string> = {
      'asesorias-fiscal': 'asesoria_fiscal',
      'asesorias-dd': 'asesoria_con_diego',
      'asesorias-como-cobrar': 'asesoria_como_cobrar',
      'asesorias-holding': 'asesoria_holding',
      'diagnostico-fiscal': 'diagnostico_fiscal',
      'consultoria-tributaria': 'consultoria_tributaria',
      'cierre-ejercicio': 'cierre_del_ejercicio',
      ept: 'ept',
    };

    return serviceTypeMap[serviceType] || serviceType || this.serviceType;
  }

  private toUniqueCompanyName(companyName: string, uniqueSeed?: string): string {
    const cleanName = companyName.trim() || 'NA';
    const cleanSeed = String(uniqueSeed || '').trim();
    if (!cleanSeed || /\(DL-[^)]+\)$/.test(cleanName)) return cleanName;

    return `${cleanName} (DL-${cleanSeed.slice(0, 8)})`;
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private isConfigured(): boolean {
    return Boolean(this.baseUrl && this.email && this.password);
  }

  private normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/dashboard\/?$/i, '').replace(/\/+$/, '');
  }

  private toMoney(value?: number | string): number {
    const normalized = Number(value || 0);
    return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
  }

  private toIsoDate(value?: string): string {
    if (!value) return new Date().toISOString().split('T')[0];

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] || new Date().toISOString().split('T')[0];
  }

  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      const message = responseData?.error
        || responseData?.errors
        || responseData?.message
        || error.message;
      return typeof message === 'string' ? message : JSON.stringify(message);
    }

    return error instanceof Error ? error.message : 'Unknown Consultoria sync error';
  }

  private isDuplicateClientError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return message.includes('ya existe') || message.includes('email');
  }
}

export const consultoriaIntegrationService = new ConsultoriaIntegrationService();

// ============================================================
// Database Models
// ============================================================

export interface Cliente {
  id: string;
  nombre: string;
  apellido?: string;
  email: string;
  telefono_whatsapp?: string;
  empresa?: string;
  puesto?: string;
  origen: 'web' | 'masterclass' | 'referido';
  estatus_comercial: LeadBusinessStatus;
  created_at: Date;
}

export type LeadBusinessStatus = 'interesado' | 'prospecto' | 'cliente';
export type LeadWorkflowStatus = 'pendiente' | 'aprobado' | 'sesion_agendada' | 'rechazado';

export interface Consultor {
  id: string;
  nombre: string;
  apellido?: string;
  email: string;
  especialidad?: string;
  activo: boolean;
  password_hash?: string;
  api_token?: string;
  created_at: Date;
}

export interface Disponibilidad {
  id: string;
  consultor_id: string;
  dia_semana: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday, 1=Monday, ...
  hora_inicio: string; // HH:MM:SS
  hora_fin: string;    // HH:MM:SS
  activo: boolean;
}

export interface Bloqueo {
  id: string;
  consultor_id: string;
  inicio: Date;
  fin: Date;
  motivo?: string;
}

export interface Cita {
  id: string;
  cliente_id: string;
  consultor_id: string;
  fecha_hora_inicio: Date;
  fecha_hora_fin: Date;
  estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show';
  meet_link?: string;
  notas_cliente?: string;
  created_at: Date;
}

export interface Calificacion {
  id: string;
  cita_id: string;
  consultor_id: string;
  resultado: 'caliente' | 'tibio' | 'frio' | 'no_aplica';
  notas_internas?: string;
  score_interes: 'alto' | 'medio' | 'bajo';
  estatus_comercial: LeadBusinessStatus;
  exportado_hubspot: boolean;
  hubspot_export_at?: Date;
  created_at: Date;
}

export interface Plantilla {
  id: string;
  canal: 'email' | 'whatsapp';
  tipo_evento: string;
  nombre: string;
  contenido: string;
  activa: boolean;
}

export interface Notificacion {
  id: string;
  cita_id: string;
  canal: 'email' | 'whatsapp';
  tipo: string;
  estado: 'pendiente' | 'enviado' | 'fallido';
  contenido?: string;
  enviado_at?: Date;
  created_at: Date;
}

// ============================================================
// API Request/Response Types
// ============================================================

export interface LeadSubmissionRequest {
  nombre: string;
  apellido?: string;
  email: string;
  telefono_whatsapp?: string;
  empresa?: string;
  puesto?: string;
  servicios: string[];
  origen?: 'web' | 'masterclass' | 'referido';
  notas?: string;
}

export interface AppointmentBookingRequest {
  cliente_id: string;
  consultor_id: string;
  fecha_hora_inicio: string; // ISO8601
  fecha_hora_fin: string;    // ISO8601
  notas_cliente?: string;
}

export interface QualificationRequest {
  cita_id: string;
  resultado: 'caliente' | 'tibio' | 'frio' | 'no_aplica';
  score_interes: 'alto' | 'medio' | 'bajo';
  notas_internas?: string;
  estatus_comercial?: LeadBusinessStatus;
}

export interface LeadSessionAssignmentRequest {
  consultor_id: string;
  fecha_hora_inicio: string;
  fecha_hora_fin?: string;
  notas_cliente?: string;
  estatus_comercial?: LeadBusinessStatus;
}

export interface SlotInfo {
  inicio: string; // ISO8601
  fin: string;    // ISO8601
  disponible: boolean;
  razon?: string; // 'blocked', 'appointment', etc
}

export interface AvailabilitySlots {
  consultor_id: string;
  consultor_nombre: string;
  fecha: string; // YYYY-MM-DD
  slots: SlotInfo[];
}

// ============================================================
// JWT Payload
// ============================================================

export interface JwtPayload {
  sub: string;        // subject (usuario_id)
  email: string;
  role: 'consultant' | 'super_admin';
  iat: number;        // issued at
  exp: number;        // expiration time
  iss: string;        // issuer
}

// ============================================================
// Express Request Extensions
// ============================================================

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      clientId?: string;
      consultantId?: string;
    }
  }
}

// ============================================================
// API Response Wrapper
// ============================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string>;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// ============================================================
// Error Types
// ============================================================

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public details?: Record<string, string>
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string = 'Resource conflict',
    public data?: any
  ) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

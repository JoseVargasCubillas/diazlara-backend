export const CLIENT_STATUS_DEFAULT = 'Cliente registrado en sistema';

export const CLIENT_STATUS_OPTIONS = [
  CLIENT_STATUS_DEFAULT,
  'Documentación recibida',
  'Cuestionario realizado',
  'Primera sesión agendada',
  'Segunda sesión agendada',
  'Tercera sesión agendada',
  'Cuarta sesión agendada',
  'Minuta de sesiones agendada',
  'Sesión agendada con Coordinador de Continuidad',
  'Pendiente de respuesta',
  'En espera de documentación',
  'NDA enviado',
] as const;

export type ClientStatus = typeof CLIENT_STATUS_OPTIONS[number];

export const isClientStatus = (value: unknown): value is ClientStatus => (
  typeof value === 'string' && CLIENT_STATUS_OPTIONS.includes(value as ClientStatus)
);

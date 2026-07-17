import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export function validateEnvironment(): void {
  const required = [
    'DB_HOST',
    'DB_USER',
    'DB_NAME',
    'JWT_SECRET',
  ];

  const missing: string[] = [];

  required.forEach((key) => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Copy .env.example to .env and fill in core API/DB values.`
    );
  }

  // Validate JWT_SECRET is long enough
  if ((process.env.JWT_SECRET || '').length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  API_URL: process.env.API_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: parseInt(process.env.DB_PORT || '3306', 10),
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRY: parseInt(process.env.JWT_EXPIRY || '86400', 10),
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_IMPERSONATE_USER: process.env.GOOGLE_IMPERSONATE_USER,
  GOOGLE_MEET_EXTRA_ATTENDEES: process.env.GOOGLE_MEET_EXTRA_ATTENDEES,
  // Multi-cuenta de calendarios (JSON). Ver docs/GOOGLE_MEET_SETUP.md
  GOOGLE_CALENDAR_ACCOUNTS: process.env.GOOGLE_CALENDAR_ACCOUNTS,
  // Si "true", rechaza intentos de agendar contra un consultor sin cuenta configurada.
  STRICT_CALENDAR_ACCOUNTS: process.env.STRICT_CALENDAR_ACCOUNTS,
  // SMTP (replaces SendGrid)
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || `"DL Sistema" <${process.env.SMTP_USER || 'no-reply@diazlara.mx'}>`,
  SMTP_REPLY_TO: process.env.SMTP_REPLY_TO || 'contacto@diazlara.mx',
  // Whapi (replaces Twilio for WhatsApp)
  WHAPI_TOKEN: process.env.WHAPI_TOKEN,
  WHAPI_URL: process.env.WHAPI_URL || 'https://gate.whapi.cloud',
  WHAPI_WEBHOOK_SECRET: process.env.WHAPI_WEBHOOK_SECRET,
  HUBSPOT_PRIVATE_APP_TOKEN: process.env.HUBSPOT_PRIVATE_APP_TOKEN,
  HUBSPOT_PORTAL_ID: process.env.HUBSPOT_PORTAL_ID,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  TRUST_PROXY: process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : 'false'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'logs/app.log',
};

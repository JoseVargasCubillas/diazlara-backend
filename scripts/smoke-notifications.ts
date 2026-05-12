/**
 * Smoke test: sends one email via SMTP and one WhatsApp message via Whapi
 * to the addresses provided as CLI args. Useful to validate the new providers
 * without going through the booking flow.
 *
 * Usage:
 *   ts-node scripts/smoke-notifications.ts <email> <whatsapp-phone>
 *   ts-node scripts/smoke-notifications.ts test@example.com 5215512345678
 *
 * Pass "-" to skip a channel:
 *   ts-node scripts/smoke-notifications.ts test@example.com -
 *   ts-node scripts/smoke-notifications.ts - 5215512345678
 */
import 'dotenv/config';
import { emailService } from '../src/services/EmailService';
import { whatsAppService } from '../src/services/WhatsAppService';

async function main() {
  const [, , emailArg, phoneArg] = process.argv;

  if (!emailArg && !phoneArg) {
    console.error('Usage: ts-node scripts/smoke-notifications.ts <email|-> <phone|->');
    process.exit(1);
  }

  if (emailArg && emailArg !== '-') {
    console.log(`→ Sending test email to ${emailArg} via SMTP…`);
    const r = await emailService.sendEmail(
      emailArg,
      'Prueba SMTP – Díaz Lara Backend',
      '<p><strong>Hola</strong>, este es un correo de prueba enviado vía SMTP.</p>'
    );
    console.log('  result:', r);
  }

  if (phoneArg && phoneArg !== '-') {
    console.log(`→ Sending test WhatsApp to ${phoneArg} via Whapi…`);
    const r = await whatsAppService.sendMessage(
      phoneArg,
      'Prueba Whapi: este mensaje proviene del backend de Díaz Lara.'
    );
    console.log('  result:', r);
  }

  // Give pino a chance to flush before exit
  setTimeout(() => process.exit(0), 500);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});

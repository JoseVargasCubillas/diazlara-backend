/**
 * Sends a real "confirmacion" template email rendered with sample variables to
 * verify the branded HTML design end-to-end.
 *
 * Usage: ts-node scripts/test-confirmacion-template.ts <email>
 */
import 'dotenv/config';
import { emailService } from '../src/services/EmailService';
import { templateService } from '../src/services/TemplateService';
import { closeDatabase } from '../src/config/database';

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: ts-node scripts/test-confirmacion-template.ts <email>');
    process.exit(1);
  }

  const variables = {
    nombre: 'Cliente de prueba',
    apellido: '',
    consultor: 'Diego Díaz',
    fecha: '13 mayo 2026',
    hora: '10:30',
    meet_link: 'https://meet.google.com/abc-defg-hij',
  };

  console.log(`→ Renderizando plantilla email/confirmacion…`);
  const html = await templateService.renderFromDatabase('email', 'confirmacion', variables);
  console.log(`  HTML length: ${html.length} chars`);
  console.log(`  Starts with: ${html.slice(0, 80)}…`);

  console.log(`→ Enviando a ${to} vía SMTP…`);
  const r = await emailService.sendEmail(
    to,
    `Confirmación de tu sesión · Díaz Lara Consultores · ${variables.fecha} ${variables.hora}`,
    html
  );
  console.log('  result:', r);

  await closeDatabase();
  setTimeout(() => process.exit(0), 500);
}

main().catch((err) => {
  console.error('✗ Test failed:', err);
  process.exit(1);
});

/**
 * Seeds / refreshes email + WhatsApp templates with the latest branded
 * design and proper UTF-8 encoding (overwrites mojibake from older seeds).
 *
 * Usage: ts-node scripts/seed-templates.ts
 */
import 'dotenv/config';
import { initializeDatabase, closeDatabase } from '../src/config/database';
import { templateService } from '../src/services/TemplateService';

const CONFIRMACION_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Confirmación de sesión · Díaz Lara Consultores</title>
</head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1f36;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(20,30,60,0.10);">
        <tr><td style="background:linear-gradient(135deg,#1a1f36 0%,#2a3460 100%);padding:36px 40px;text-align:center;">
          <div style="font-size:11px;letter-spacing:4px;color:#c9a661;font-weight:700;text-transform:uppercase;">Díaz Lara Consultores</div>
          <div style="font-size:24px;color:#ffffff;font-weight:700;margin-top:10px;letter-spacing:0.3px;">Tu sesión está confirmada</div>
          <div style="font-size:13px;color:#c8cce0;margin-top:6px;">Sesión exploratoria · 15 minutos</div>
        </td></tr>
        <tr><td style="padding:36px 40px 8px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Hola <strong>{{nombre}}</strong>,</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#3a4566;">
            Hemos agendado tu <strong>sesión estratégica</strong> con el equipo de Díaz Lara Consultores. A continuación encontrarás los detalles y el enlace para conectarte.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ee;border-left:4px solid #c9a661;border-radius:8px;margin-bottom:28px;">
            <tr><td style="padding:18px 22px;font-size:15px;line-height:1.9;color:#1a1f36;">
              <div><strong style="color:#1a1f36;display:inline-block;width:90px;">Fecha</strong> {{fecha}}</div>
              <div><strong style="color:#1a1f36;display:inline-block;width:90px;">Hora</strong> {{hora}} <span style="color:#6b7591;">(hora de México)</span></div>
              <div><strong style="color:#1a1f36;display:inline-block;width:90px;">Consultor</strong> {{consultor}}</div>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 24px;">
            <tr><td style="background:#c9a661;border-radius:10px;box-shadow:0 4px 12px rgba(201,166,97,0.35);">
              <a href="{{meet_link}}" target="_blank" style="display:inline-block;padding:14px 36px;color:#1a1f36;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:0.4px;">
                Unirme a la videollamada
              </a>
            </td></tr>
          </table>
          <p style="font-size:12px;line-height:1.6;color:#6b7591;text-align:center;margin:0 0 28px;">
            ¿No funciona el botón? Copia este enlace en tu navegador:<br>
            <span style="color:#1a1f36;word-break:break-all;font-weight:600;">{{meet_link}}</span>
          </p>
          <hr style="border:none;border-top:1px solid #ece5d2;margin:0 0 22px;">
          <p style="font-size:13px;line-height:1.7;color:#6b7591;margin:0 0 6px;">
            Recibirás un recordatorio 24 horas antes y otro una hora antes. Si necesitas reprogramar, simplemente responde a este correo o escríbenos por WhatsApp.
          </p>
        </td></tr>
        <tr><td style="background:#1a1f36;padding:22px 40px;text-align:center;">
          <div style="font-size:12px;color:#c9a661;letter-spacing:2px;font-weight:700;">DÍAZ LARA CONSULTORES</div>
          <div style="font-size:11px;color:#9aa1bd;margin-top:6px;letter-spacing:0.4px;">Asesoría Fiscal · Contable · Financiera</div>
          <div style="font-size:11px;color:#6b7395;margin-top:10px;">contacto@diazlara.mx · diazlara.mx</div>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#8a8378;margin-top:18px;max-width:560px;line-height:1.5;">
        Recibiste este correo porque agendaste una sesión con Díaz Lara Consultores. Si no reconoces esta cita, ignora este mensaje.
      </div>
    </td></tr>
  </table>
</body>
</html>`;

const RECORDATORIO_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Recordatorio · Díaz Lara Consultores</title>
</head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1f36;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(20,30,60,0.10);">
        <tr><td style="background:linear-gradient(135deg,#1a1f36 0%,#2a3460 100%);padding:32px 40px;text-align:center;">
          <div style="font-size:11px;letter-spacing:4px;color:#c9a661;font-weight:700;text-transform:uppercase;">Recordatorio</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;margin-top:10px;">Tu sesión es muy pronto</div>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Hola <strong>{{nombre}}</strong>,</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 24px;color:#3a4566;">
            Te recordamos tu sesión estratégica con Díaz Lara Consultores hoy a las <strong>{{hora}}</strong> (hora de México).
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 24px;">
            <tr><td style="background:#c9a661;border-radius:10px;box-shadow:0 4px 12px rgba(201,166,97,0.35);">
              <a href="{{meet_link}}" target="_blank" style="display:inline-block;padding:14px 36px;color:#1a1f36;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:0.4px;">
                Unirme ahora
              </a>
            </td></tr>
          </table>
          <p style="font-size:12px;line-height:1.6;color:#6b7591;text-align:center;margin:0;">
            Enlace directo: <span style="color:#1a1f36;word-break:break-all;font-weight:600;">{{meet_link}}</span>
          </p>
        </td></tr>
        <tr><td style="background:#1a1f36;padding:18px 40px;text-align:center;">
          <div style="font-size:12px;color:#c9a661;letter-spacing:2px;font-weight:700;">DÍAZ LARA CONSULTORES</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const CANCELACION_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cancelación · Díaz Lara Consultores</title>
</head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1f36;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(20,30,60,0.10);">
        <tr><td style="background:linear-gradient(135deg,#1a1f36 0%,#2a3460 100%);padding:32px 40px;text-align:center;">
          <div style="font-size:11px;letter-spacing:4px;color:#c9a661;font-weight:700;text-transform:uppercase;">Sesión cancelada</div>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Hola <strong>{{nombre}}</strong>,</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3a4566;">
            Te confirmamos que tu sesión estratégica con Díaz Lara Consultores ha sido cancelada.
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 6px;color:#3a4566;">
            Si deseas reprogramarla, responde a este correo o escríbenos por WhatsApp y con gusto buscamos un nuevo horario.
          </p>
        </td></tr>
        <tr><td style="background:#1a1f36;padding:18px 40px;text-align:center;">
          <div style="font-size:12px;color:#c9a661;letter-spacing:2px;font-weight:700;">DÍAZ LARA CONSULTORES</div>
          <div style="font-size:11px;color:#9aa1bd;margin-top:6px;">contacto@diazlara.mx</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const SEGUIMIENTO_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Gracias · Díaz Lara Consultores</title>
</head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1f36;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(20,30,60,0.10);">
        <tr><td style="background:linear-gradient(135deg,#1a1f36 0%,#2a3460 100%);padding:32px 40px;text-align:center;">
          <div style="font-size:11px;letter-spacing:4px;color:#c9a661;font-weight:700;text-transform:uppercase;">Gracias por tu tiempo</div>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Hola <strong>{{nombre}}</strong>,</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 18px;color:#3a4566;">
            Agradecemos tu participación en la sesión estratégica con Díaz Lara Consultores. Esperamos haber aportado claridad y próximos pasos para tu negocio.
          </p>
          <p style="font-size:15px;line-height:1.7;margin:0;color:#3a4566;">
            Si necesitas profundizar en algún tema o avanzar con una propuesta de servicios, responde este correo y te apoyamos.
          </p>
        </td></tr>
        <tr><td style="background:#1a1f36;padding:18px 40px;text-align:center;">
          <div style="font-size:12px;color:#c9a661;letter-spacing:2px;font-weight:700;">DÍAZ LARA CONSULTORES</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const WHATSAPP_CONFIRMACION =
  '✅ *Díaz Lara Consultores*\n\nHola {{nombre}}, tu sesión estratégica está confirmada.\n\n📅 *Fecha:* {{fecha}}\n🕐 *Hora:* {{hora}} (hora de México)\n👤 *Consultor:* {{consultor}}\n\n🎥 *Enlace:* {{meet_link}}\n\nDuración: 15 minutos. Si necesitas reprogramar, responde este mensaje.';

const WHATSAPP_RECORDATORIO =
  '⏰ *Recordatorio · Díaz Lara*\n\nHola {{nombre}}, tu sesión es hoy a las *{{hora}}*.\n\n🎥 Enlace: {{meet_link}}';

const WHATSAPP_CANCELACION =
  '❌ *Díaz Lara Consultores*\n\nHola {{nombre}}, tu sesión ha sido cancelada. Si deseas reprogramar, responde este mensaje.';

async function main() {
  await initializeDatabase();
  console.log('✓ Database connected');

  await templateService.upsertTemplate(
    'email',
    'confirmacion',
    'Confirmación de sesión estratégica',
    CONFIRMACION_HTML
  );
  console.log('✓ email/confirmacion');

  await templateService.upsertTemplate(
    'email',
    'recordatorio',
    'Recordatorio de sesión',
    RECORDATORIO_HTML
  );
  console.log('✓ email/recordatorio');

  await templateService.upsertTemplate(
    'email',
    'cancelacion',
    'Cancelación de sesión',
    CANCELACION_HTML
  );
  console.log('✓ email/cancelacion');

  await templateService.upsertTemplate(
    'email',
    'seguimiento',
    'Seguimiento post-sesión',
    SEGUIMIENTO_HTML
  );
  console.log('✓ email/seguimiento');

  await templateService.upsertTemplate(
    'whatsapp',
    'confirmacion',
    'Confirmación WhatsApp',
    WHATSAPP_CONFIRMACION
  );
  console.log('✓ whatsapp/confirmacion');

  await templateService.upsertTemplate(
    'whatsapp',
    'recordatorio',
    'Recordatorio WhatsApp',
    WHATSAPP_RECORDATORIO
  );
  console.log('✓ whatsapp/recordatorio');

  await templateService.upsertTemplate(
    'whatsapp',
    'cancelacion',
    'Cancelación WhatsApp',
    WHATSAPP_CANCELACION
  );
  console.log('✓ whatsapp/cancelacion');

  await closeDatabase();
  console.log('\n✅ Plantillas actualizadas');
}

main().catch((err) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});

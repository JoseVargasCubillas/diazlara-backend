# Google Meet · Configuración de Service Account

Para que la aplicación pueda **crear videollamadas reales de Google Meet**, necesitas un **Google Workspace** (no funciona con cuentas Gmail personales) y configurar un Service Account con **Domain-Wide Delegation**.

## 1. Crear un proyecto en Google Cloud

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) con tu cuenta de Workspace.
2. Crea un nuevo proyecto, por ejemplo `diazlara-meet`.
3. Habilita la **Google Calendar API** en *APIs & Services → Library*.

## 2. Crear el Service Account

1. *IAM & Admin → Service Accounts → Create Service Account*.
2. Nombre: `diazlara-calendar-bot`. Continúa hasta crear.
3. Abre el service account → *Keys → Add key → Create new key → JSON*. Descarga el archivo (no lo subas a git).
4. Anota el **`client_id`** que aparece en *Details* (lo necesitarás en el siguiente paso).

## 3. Habilitar Domain-Wide Delegation

1. En la pestaña *Details* del service account, marca **Enable Google Workspace Domain-wide Delegation**.
2. Entra al **Admin Console** de Google Workspace: <https://admin.google.com/> con un usuario administrador.
3. *Security → Access and data control → API controls → Manage Domain Wide Delegation → Add new*.
4. **Client ID:** el `client_id` numérico del paso anterior.
5. **OAuth scopes** (separados por coma):
   ```
   https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events
   ```
6. Authorize.

## 4. Variables de entorno

En `.env`:

```bash
# Pega TODO el JSON descargado en una sola línea (sin saltos de línea reales).
# En Windows PowerShell puedes generar la línea con:
#   (Get-Content .\service-account.json -Raw) -replace "`r`n",""
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n", ...}

# Usuario de Workspace que será el "organizador" de las reuniones.
# Las videollamadas aparecerán en su Google Calendar.
GOOGLE_IMPERSONATE_USER=contacto@diazlara.mx

# (Opcional) ID de calendario; "primary" = calendario principal del usuario impersonado.
GOOGLE_CALENDAR_ID=primary
```

## 5. Probar

Reinicia el backend y agenda una cita desde el portal de asesores. Deberías ver en los logs:

```
INFO: Google Meet link created for cliente@correo.com: https://meet.google.com/abc-defg-hij
```

Y la videollamada aparecerá en el Google Calendar del usuario impersonado.

## Diagnóstico

| Error | Causa | Solución |
|---|---|---|
| `unauthorized_client` | Domain-wide delegation no autorizada o scopes faltan | Repite el paso 3 con los scopes exactos |
| `Login Required` | Falta `subject` (impersonación) | Verifica `GOOGLE_IMPERSONATE_USER` |
| `Calendar API has not been used` | API deshabilitada | Habilita Calendar API (paso 1.3) |
| `invalid_grant: Account not found` | Usuario impersonado no existe en Workspace | Usa un correo real del dominio |

## Modo degradado

Si Meet no está configurado, las citas **se siguen creando** pero sin enlace de videollamada. En los logs verás un `WARN` y el consultor podrá adjuntar un enlace manualmente desde el portal.

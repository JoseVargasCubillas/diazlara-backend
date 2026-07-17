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

# --- Modo multi-cuenta (recomendado en producción) ---
# JSON con la lista de cuentas Workspace autorizadas. Cada consultor_id
# (UUID de la tabla CONSULTORES) resuelve a exactamente una cuenta.
GOOGLE_CALENDAR_ACCOUNTS=[{"key":"jessica","impersonateUser":"jessica.tapia@diegodiaz.mx","calendarId":"primary","consultorIds":["<UUID_JESSICA>"]},{"key":"jazmin","impersonateUser":"fiscalista@diegodiaz.mx","calendarId":"primary","consultorIds":["<UUID_JAZMIN>"]}]

# Si "true", rechaza intentos de agendar contra un consultor no mapeado.
STRICT_CALENDAR_ACCOUNTS=true

# --- Compatibilidad hacia atrás (una sola cuenta) ---
# Se usan sólo si GOOGLE_CALENDAR_ACCOUNTS está vacío.
GOOGLE_IMPERSONATE_USER=contacto@diazlara.mx
GOOGLE_CALENDAR_ID=primary
```

### Modo multi-cuenta explicado

- El **mismo service account** puede impersonar a Jessica y a Jazmin: en el
  Admin Console autorizas UNA vez el `client_id` numérico con los scopes de
  Calendar (paso 3) y a partir de ahí el backend puede actuar como
  cualquier usuario del dominio (`@diegodiaz.mx`).
- No hay que compartir calendarios entre las dos cuentas. Cada evento
  vive en el calendario `primary` de la consultora que aparece como
  `impersonateUser`, ella es la organizadora del Meet y quien envía la
  invitación al lead.
- El resolver del backend usa el `consultor_id` que el frontend envía en
  `POST /api/admin/leads-espera/:id/asignar-sesion`. No hay selector de
  cuenta en el frontend.
- Si un `consultor_id` no está mapeado y `STRICT_CALENDAR_ACCOUNTS=true`,
  el backend responde con un error claro sin caer al calendario legacy.

### Cómo autorizar la cuenta de Jessica

1. Confirma que Jessica tiene un usuario activo en Google Workspace
   (`jessica.tapia@diegodiaz.mx` o el correo real que uses).
2. Obtén su `consultor_id` (UUID) desde la BD:
   ```sql
   SELECT id, nombre, apellido, email FROM CONSULTORES
   WHERE nombre LIKE 'Jessica%' AND apellido LIKE 'Tapia%';
   ```
3. Agrégala como entrada `"key":"jessica"` en `GOOGLE_CALENDAR_ACCOUNTS`
   con ese `consultorIds`.
4. Reinicia el backend. En los logs debe aparecer
   `[Startup] Google Calendar accounts loaded` con la key `jessica`.

### Cómo autorizar la cuenta de Jazmin (`fiscalista@diegodiaz.mx`)

1. Igual que Jessica: confirma usuario Workspace y busca su `consultor_id`:
   ```sql
   SELECT id, nombre, apellido, email FROM CONSULTORES
   WHERE nombre LIKE 'Jazmin%' AND apellido LIKE 'Robles%';
   ```
2. Agrégala como entrada `"key":"jazmin"`.
3. Reinicia el backend.

### Migración de BD

Correr una única vez (MySQL 8.0.29+ o MariaDB 10.0.2+):

```bash
mysql -u <user> -p <db> < scripts/2026-07-add-calendar-account-to-citas.sql
```

Agrega dos columnas a `CITAS`: `google_event_id` (para cancelar/reprogramar
en el calendario correcto) y `calendar_account_key` (para saber qué cuenta
lo creó). Sin la migración, las cancelaciones no se propagan a Google.

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

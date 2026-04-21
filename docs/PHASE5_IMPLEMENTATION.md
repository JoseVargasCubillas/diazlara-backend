# Phase 5: Google Meet, HubSpot & Scheduler Implementation

## Overview

Phase 5 completes the backend with three critical integrations:

1. **Google Meet API** - Automatic meeting link generation for appointments
2. **HubSpot CRM** - Lead and qualification synchronization
3. **Appointment Scheduler** - Automated 24h and 1h reminder notifications

---

## 1. Google Meet API Integration

### Architecture

**File:** `src/services/GoogleMeetService.ts`

The `GoogleMeetService` uses Google Calendar API with a service account to:
- Create calendar events with Google Meet conference data
- Extract the auto-generated Meet URL
- Send calendar invites to consultant and client

### How It Works

```typescript
// In appointmentController.createAppointment():
const meetLink = await googleMeetService.generateMeetLink(
  consultantEmail,      // Consultant's Google account
  clientEmail,          // Client's email
  clientName,           // For calendar event title
  startTime,            // Appointment start
  endTime               // Appointment end
);
```

### Environment Setup

#### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project: "diazlara-backend"
3. Enable APIs:
   - Google Calendar API
   - Google Meet API

#### Step 2: Create Service Account
1. Go to **Service Accounts** in IAM & Admin
2. Click **Create Service Account**
3. Name: `diazlara-backend`
4. Grant role: `Editor` (or more restrictively: `Calendar Admin`)
5. Create JSON key
6. Download the key file

#### Step 3: Configure Consultant's Calendar
1. Get consultant's Google account email: `diego@gmail.com` (example)
2. Go to Google Calendar Settings → Share calendar
3. Add service account email (`xxx@xxx.iam.gserviceaccount.com`) as editor
4. This allows service account to create events on consultant's calendar

#### Step 4: Set Environment Variables

```bash
# .env
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"xxx","private_key_id":"xxx","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"diazlara-backend@xxx.iam.gserviceaccount.com","client_id":"xxx","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/xxx.iam.gserviceaccount.com"}'

# Consultant's calendar ID (email or calendar ID)
GOOGLE_CALENDAR_ID=diego@gmail.com
```

#### Step 5: Test It

```bash
npm run dev

# Create an appointment via API
POST /api/appointments
{
  "cliente_id": "xxx",
  "consultor_id": "xxx",
  "fecha_hora_inicio": "2026-04-25T10:00:00Z",
  "fecha_hora_fin": "2026-04-25T10:15:00Z"
}

# Response should include a valid Google Meet link:
{
  "meet_link": "https://meet.google.com/xxx-yyyy-zzz"
}
```

### Troubleshooting

- **"GOOGLE_SERVICE_ACCOUNT_JSON not set"** - Verify `.env` file has the full JSON
- **"Failed to generate Google Meet link"** - Check service account has calendar access
- **"Invalid private key"** - Ensure newlines in private key are preserved as `\n`
- **Fallback URL returned** - Service account permissions issue; check calendar sharing

---

## 2. HubSpot CRM Integration

### Architecture

**File:** `src/services/HubSpotService.ts`

The `HubSpotService` syncs with HubSpot CRM:
- Creates/updates contacts when leads are submitted
- Creates deals/opportunities when appointments are booked
- Updates deal stage and properties when qualifications are created

### Sync Flow

```
Lead Created → Contact created in HubSpot
Appointment Created → Deal/Opportunity created, linked to contact
Qualification Created → Deal properties updated with result
  - resultado: caliente → dealstage: "presentationscheduled"
  - resultado: tibio → dealstage: "qualificationsentered"
  - resultado: frio → dealstage: "closedlost"
```

### How It Works

```typescript
// In qualificationController.createQualification():
setImmediate(() => {
  hubspotService.syncQualification(
    {
      email: client.email,
      nombre: client.nombre,
      apellido: client.apellido,
      telefono_whatsapp: client.telefono_whatsapp,
      empresa: client.empresa,
      puesto: client.puesto,
    },
    {
      resultado: data.resultado,      // 'caliente', 'tibio', 'frio', 'no_aplica'
      score_interes: data.score_interes  // 'alto', 'medio', 'bajo'
    },
    {
      cliente_nombre: client.nombre,
      fecha_hora_inicio: new Date(cita.fecha_hora_inicio),
      consultor_nombre: cita.consultor_nombre,
    }
  );
});
```

### Environment Setup

#### Step 1: Create HubSpot Private App
1. Go to [HubSpot App Dashboard](https://app.hubspot.com/home)
2. Settings → Apps and integrations → Private apps
3. Create app: "Díaz Lara Backend"
4. Grant scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
   - `crm.objects.contacts.create`
   - `crm.associations.write`
5. Click **Create app**
6. Copy the **Private app access token**

#### Step 2: Set Environment Variables

```bash
# .env
HUBSPOT_PRIVATE_APP_TOKEN=pat-xxx
HUBSPOT_PORTAL_ID=xxx  # Optional, extracted from HubSpot account
```

#### Step 3: Configure HubSpot Deal Pipeline (Optional)

By default, HubSpot uses the "Sales Pipeline" with these stages:
- `negotiation` - New appointment created
- `presentationscheduled` - Resultado: caliente
- `qualificationsentered` - Resultado: tibio
- `closedlost` - Resultado: frio

If your HubSpot uses custom stages, update the `stageMap` in `HubSpotService.updateDealQualification()`.

#### Step 4: Test It

```bash
npm run dev

# Create a lead (creates HubSpot contact)
POST /api/leads
{
  "nombre": "Juan",
  "email": "juan@empresa.com",
  "telefono_whatsapp": "5551234567",
  "empresa": "Tech Solutions SA"
}

# Check HubSpot CRM → Contacts for new contact

# Create appointment (creates deal if not exists)
POST /api/appointments
{
  "cliente_id": "xxx",
  "consultor_id": "xxx",
  "fecha_hora_inicio": "2026-04-25T10:00:00Z",
  "fecha_hora_fin": "2026-04-25T10:15:00Z"
}

# Check HubSpot CRM → Deals for new deal

# Create qualification (updates deal with status)
POST /api/qualifications
{
  "cita_id": "xxx",
  "resultado": "caliente",
  "score_interes": "alto"
}

# Check HubSpot deal — stage should be "Presentation Scheduled"
```

### Troubleshooting

- **"HubSpot API key not configured"** - Ensure `HUBSPOT_PRIVATE_APP_TOKEN` in `.env`
- **Contact not found** - Check API token has `crm.objects.contacts.read` scope
- **Deal creation failed** - Verify API token has `crm.objects.deals.write` scope
- **API 401 Unauthorized** - Token may have expired; regenerate in HubSpot

---

## 3. Appointment Scheduler

### Architecture

**File:** `src/services/AppointmentScheduler.ts`

Uses `node-cron` to schedule background jobs:

- **Every 10 minutes**: Check for appointments needing reminders
  - 24 hours before: Send 24h reminder
  - 1 hour before: Send 1h reminder
- **Daily at 2:15 AM**: Retry failed notifications

### How It Works

```typescript
// In src/index.ts:
const server = app.listen(PORT, () => {
  appointmentScheduler.start();  // Start cron jobs on server start
});

// Graceful shutdown:
process.on('SIGTERM', () => {
  appointmentScheduler.stop();   // Stop cron jobs
  server.close();
});
```

### Scheduler Configuration

**Every 10 minutes** (checks for reminders):
```typescript
cron.schedule('*/10 * * * *', async () => {
  await notificationService.processPendingReminders();
});
```

This queries the database:
```sql
-- Appointments needing 24h reminder (within 23-25 hours from now)
SELECT id FROM CITAS
WHERE estado IN ('pendiente', 'confirmada')
AND DATE_ADD(NOW(), INTERVAL 23 HOUR) < fecha_hora_inicio
AND DATE_ADD(NOW(), INTERVAL 25 HOUR) > fecha_hora_inicio
AND id NOT IN (
  SELECT DISTINCT cita_id FROM NOTIFICACIONES
  WHERE tipo = 'recordatorio' AND DATEDIFF(created_at, NOW()) <= 1
)

-- Appointments needing 1h reminder (within 55-65 minutes from now)
SELECT id FROM CITAS
WHERE estado IN ('pendiente', 'confirmada')
AND DATE_ADD(NOW(), INTERVAL 55 MINUTE) < fecha_hora_inicio
AND DATE_ADD(NOW(), INTERVAL 65 MINUTE) > fecha_hora_inicio
AND id NOT IN (
  SELECT DISTINCT cita_id FROM NOTIFICACIONES
  WHERE tipo = 'recordatorio_1h' AND DATEDIFF(created_at, NOW()) < 1
)
```

**Daily at 2:15 AM** (retries failed notifications):
```typescript
cron.schedule('15 2 * * *', async () => {
  await notificationService.retryFailedNotifications();
});
```

### Testing the Scheduler

In development, you can manually trigger reminders:

```bash
# Manual test in code:
const { notificationService } = await import('./services/NotificationService');
await notificationService.processPendingReminders();
```

Or create a test appointment 30 minutes in the future, wait, and check if reminder is sent.

### Scheduler Logs

The scheduler logs all activity:
```
✓ Appointment scheduler started
Running appointment reminder scheduler
Pending reminders processed
✓ Appointment scheduler stopped
```

Monitor via:
```bash
npm run dev | grep -i scheduler
```

---

## 4. Database: NOTIFICACIONES Table

Tracks all sent notifications to avoid duplicates:

```sql
CREATE TABLE NOTIFICACIONES (
  id CHAR(36) PRIMARY KEY,
  cita_id CHAR(36) NOT NULL,
  tipo ENUM('confirmacion', 'recordatorio', 'recordatorio_1h', 'seguimiento', 'cancelacion') NOT NULL,
  canal ENUM('email', 'whatsapp') NOT NULL,
  destinatario VARCHAR(255) NOT NULL,
  estado ENUM('pendiente', 'enviado', 'fallido') NOT NULL,
  reintento_count INT DEFAULT 0,
  proximo_reintento TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cita_id) REFERENCES CITAS(id)
);
```

---

## 5. Summary of Changes

### New Services
- `GoogleMeetService.ts` - Google Calendar API integration
- `HubSpotService.ts` - HubSpot CRM integration
- `AppointmentScheduler.ts` - Cron job scheduler

### Updated Controllers
- `appointmentController.ts` - Uses GoogleMeetService to generate real Meet links
- `qualificationController.ts` - Syncs to HubSpot after creating qualifications

### Updated Routes
- `qualifications.ts` - Removed TODO comment, now actually syncs to HubSpot

### New Dependencies
- `googleapis` - Google Calendar API client
- `google-auth-library` - Service account authentication
- `node-cron` - Background job scheduling
- `@types/node-cron` - TypeScript types for node-cron

### Updated Files
- `package.json` - Added new dependencies
- `src/index.ts` - Start/stop appointment scheduler with server

---

## 6. Deployment Checklist

Before deploying Phase 5 to Hostinger:

- [ ] Google service account created and calendar shared with service account
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` set in `.env` on Hostinger
- [ ] `GOOGLE_CALENDAR_ID` set to consultant's email
- [ ] HubSpot private app created with proper scopes
- [ ] `HUBSPOT_PRIVATE_APP_TOKEN` set in `.env` on Hostinger
- [ ] Database includes NOTIFICACIONES table (run migrations)
- [ ] Test API endpoint creates Google Meet links
- [ ] Test API endpoint syncs qualifications to HubSpot
- [ ] Verify cron jobs start in server logs
- [ ] Send test appointment, verify 24h/1h reminders are sent

---

## 7. What Happens End-to-End

1. **Client submits form** → Lead created in database + HubSpot contact created
2. **Client books appointment** → Appointment created + Google Meet link generated + Confirmation email + WhatsApp sent
3. **24h before appointment** → Scheduler sends WhatsApp reminder
4. **1h before appointment** → Scheduler sends WhatsApp reminder
5. **Consultant rates after call** → Qualification created + HubSpot deal updated with rating
6. **Qualification exported** → Deal stage updated (caliente → presentationscheduled, etc)
7. **Lead is tracked in HubSpot** → Sales team can follow up with qualified leads

---

## 8. Cost Considerations

- **Google Calendar API**: Free (no additional cost beyond normal Google Cloud usage)
- **HubSpot**: ~$50-100/month for Professional plan (includes API access)
- **Twilio WhatsApp**: ~$0.01-0.03 per message
- **SendGrid Email**: Free tier includes 100 emails/day

---

## 9. Next Steps

After Phase 5, remaining work includes:

**Phase 6:** Admin Dashboard Backend
- GET/POST endpoints for managing consultant availability
- GET/POST endpoints for creating/managing appointment blocks
- Consultant statistics and performance dashboards

**Phase 7:** Comprehensive Testing
- Unit tests for SlotCalculatorService, TemplateService, ValidationService
- Integration tests for all API endpoints
- Mock Google Calendar and HubSpot responses

**Phase 8:** Production Deployment
- Deploy to Hostinger
- Set up CI/CD pipeline (GitHub Actions)
- Monitor error logs and scheduler execution
- Configure email/SMS alerts for failures


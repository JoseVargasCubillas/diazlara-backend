# Phase 5 Deployment Checklist

## Pre-Deployment Setup

### ✅ Local Development Verification

- [ ] Clone/pull latest code from repo
- [ ] Run `npm install` in backend directory
- [ ] Run `npm run build` - should complete without errors
- [ ] Create `.env` file from `.env.example`
- [ ] Set `NODE_ENV=development` in `.env`
- [ ] Run `npm run dev` - server should start without errors

### ✅ Google Meet API Setup

**Timeline:** ~15 minutes

1. [ ] Go to [Google Cloud Console](https://console.cloud.google.com)
2. [ ] Create new project (or use existing)
3. [ ] Enable APIs:
   - [ ] Google Calendar API
   - [ ] Google Meet API
4. [ ] Create Service Account:
   - [ ] IAM & Admin → Service Accounts
   - [ ] Create Service Account (name: "diazlara-backend")
   - [ ] Grant Editor role (or Calendar Admin role)
   - [ ] Create JSON key
   - [ ] Download and save key
5. [ ] Configure Consultant's Calendar:
   - [ ] Log into consultant's Google account
   - [ ] Open Google Calendar Settings
   - [ ] Share calendar with service account email
   - [ ] Grant "Editor" access
6. [ ] Update `.env`:
   ```bash
   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
   GOOGLE_CALENDAR_ID=consultant@gmail.com
   ```
7. [ ] Test in development:
   ```bash
   POST http://localhost:3000/api/appointments
   {
     "cliente_id": "test-client-id",
     "consultor_id": "test-consultant-id",
     "fecha_hora_inicio": "2026-04-25T10:00:00Z",
     "fecha_hora_fin": "2026-04-25T10:15:00Z"
   }
   # Response should include real Google Meet link
   ```

### ✅ HubSpot Integration Setup

**Timeline:** ~10 minutes

1. [ ] Log into [HubSpot](https://app.hubspot.com)
2. [ ] Create Private App:
   - [ ] Settings → Integrations → Private apps
   - [ ] Create new app (name: "Díaz Lara Backend")
   - [ ] Grant scopes:
     - [ ] `crm.objects.contacts.read`
     - [ ] `crm.objects.contacts.write`
     - [ ] `crm.objects.contacts.create`
     - [ ] `crm.objects.deals.read`
     - [ ] `crm.objects.deals.write`
     - [ ] `crm.associations.write`
   - [ ] Create and copy Private app access token
3. [ ] Update `.env`:
   ```bash
   HUBSPOT_PRIVATE_APP_TOKEN=pat-na1-xxx...
   HUBSPOT_PORTAL_ID=12345678  # Optional
   ```
4. [ ] Test in development:
   ```bash
   POST http://localhost:3000/api/qualifications
   {
     "cita_id": "test-appointment-id",
     "resultado": "caliente",
     "score_interes": "alto"
   }
   # Check HubSpot UI for new/updated contact and deal
   ```

### ✅ Local Integration Testing

- [ ] Test form submission (POST /api/leads)
  - [ ] Verify contact created in HubSpot
- [ ] Test appointment booking (POST /api/appointments)
  - [ ] Verify real Google Meet link in response
  - [ ] Verify calendar event in consultant's calendar
  - [ ] Verify confirmation email received
  - [ ] Verify confirmation WhatsApp received
- [ ] Test qualification submission (POST /api/qualifications)
  - [ ] Verify HubSpot contact exists
  - [ ] Verify HubSpot deal created or updated
  - [ ] Verify deal stage matches resultado
- [ ] Test scheduler
  - [ ] Create appointment 25 hours in future
  - [ ] Create appointment 65 minutes in future
  - [ ] Wait for scheduler to run (every 10 minutes)
  - [ ] Verify reminders sent

### ✅ Database Migrations

- [ ] Verify `CITAS` table has `meet_link` column
- [ ] Verify `NOTIFICACIONES` table exists
- [ ] Verify `CALIFICACIONES` table has `exportado_hubspot` column
- [ ] Run: `npm run migrate` (should show "0 new migrations" if all done)

---

## Hostinger Deployment

### ✅ Pre-Deployment on Hostinger

1. [ ] Log into Hostinger control panel
2. [ ] Create/verify Node.js application:
   - [ ] Node.js version: 18+ (verify in Hostinger)
   - [ ] Application root: `/public_html` or `/app`
3. [ ] Verify MySQL database exists
   - [ ] Database name: `diazlara` (or configured DB_NAME)
   - [ ] User has full privileges
4. [ ] Clone repo to Hostinger server:
   ```bash
   cd ~/public_html (or /app)
   git clone https://github.com/your-repo/diazlara-backend.git .
   git checkout main
   ```

### ✅ Environment Configuration on Hostinger

1. [ ] Create `.env` file on Hostinger:
   ```bash
   # SSH into Hostinger server
   ssh user@hostinger.com
   cd ~/public_html
   nano .env
   ```

2. [ ] Set all environment variables:
   ```bash
   NODE_ENV=production
   PORT=3000
   API_URL=https://api.diazlara.mx/api
   FRONTEND_URL=https://diazlara.mx
   
   DB_HOST=your-hostinger-mysql-host
   DB_PORT=3306
   DB_USER=diazlara_user
   DB_PASSWORD=your_secure_password
   DB_NAME=diazlara
   DB_POOL_SIZE=10
   
   JWT_SECRET=your_secure_random_string_32_chars_minimum
   JWT_EXPIRY=86400
   
   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
   GOOGLE_CALENDAR_ID=consultant@gmail.com
   
   SENDGRID_API_KEY=SG.xxx
   SENDGRID_FROM_EMAIL=citas@diazlara.mx
   SENDGRID_FROM_NAME=Díaz Lara Consultores
   
   TWILIO_ACCOUNT_SID=ACxxx
   TWILIO_AUTH_TOKEN=xxx
   TWILIO_WHATSAPP_NUMBER=+14155552671
   TWILIO_WEBHOOK_URL=https://api.diazlara.mx/api/webhooks/twilio
   
   HUBSPOT_PRIVATE_APP_TOKEN=pat-xxx
   HUBSPOT_PORTAL_ID=12345678
   
   CORS_ORIGIN=https://diazlara.mx
   LOG_LEVEL=info
   ```

3. [ ] Save and exit: `Ctrl+X`, `Y`, `Enter`

### ✅ Dependencies and Build

1. [ ] Install dependencies on Hostinger:
   ```bash
   npm ci --omit=dev
   ```

2. [ ] Run TypeScript build:
   ```bash
   npm run build
   ```

3. [ ] Verify build completed:
   ```bash
   ls -la dist/
   # Should show index.js and other compiled files
   ```

### ✅ Database Setup

1. [ ] Run migrations:
   ```bash
   npm run migrate
   ```

2. [ ] Verify seed data:
   ```bash
   # SSH into MySQL
   mysql -u diazlara_user -p diazlara
   SELECT COUNT(*) FROM CONSULTORES;  # Should show 1
   SELECT COUNT(*) FROM PLANTILLAS;   # Should show 3+
   ```

3. [ ] Exit: `exit`

### ✅ Start Application

1. [ ] Use Hostinger's Node.js app manager to start the application
2. [ ] Verify startup logs:
   - [ ] "✓ Server running on http://localhost:3000"
   - [ ] "✓ Environment: production"
   - [ ] "Appointment scheduler started"
3. [ ] Monitor logs for first 5 minutes (check for errors)

### ✅ Production Testing

1. [ ] Test API endpoints:
   ```bash
   # Replace api.diazlara.mx with your actual domain
   curl https://api.diazlara.mx/api/availability/consultants
   # Should return list of consultants
   ```

2. [ ] Test form submission:
   - [ ] Go to https://diazlara.mx
   - [ ] Submit contact form
   - [ ] Verify lead created in database
   - [ ] Verify contact appears in HubSpot (may take 1-2 min)

3. [ ] Test appointment booking:
   - [ ] Submit form with name, email, phone
   - [ ] Select consultant and date/time
   - [ ] Confirm appointment created
   - [ ] Verify email received with Google Meet link
   - [ ] Verify WhatsApp received with Meet link
   - [ ] Test Meet link (should open Google Meet)

4. [ ] Monitor scheduler:
   - [ ] Check server logs for "Pending reminders processed" every 10 minutes
   - [ ] Create appointment 65 minutes in future
   - [ ] Wait for scheduler to run
   - [ ] Verify 1h reminder WhatsApp received

### ✅ Monitoring & Alerts

1. [ ] Set up error logging:
   - [ ] Configure error email notifications
   - [ ] Monitor logs for HubSpot API errors
   - [ ] Monitor logs for Google Calendar API errors

2. [ ] Set up uptime monitoring:
   - [ ] Use UptimeRobot or similar to monitor https://api.diazlara.mx/api/availability/consultants
   - [ ] Configure alerts for downtime

3. [ ] Daily checks:
   - [ ] Verify scheduler running (check logs at 2:15 AM)
   - [ ] Verify no unhandled exceptions
   - [ ] Verify HubSpot contacts syncing

---

## Post-Deployment Verification

### ✅ 24-Hour Verification

After 24 hours, verify:

- [ ] Server still running (no crashes)
- [ ] Scheduler tasks executed (check logs for "Pending reminders processed")
- [ ] At least one 24h reminder sent (if appointment exists)
- [ ] HubSpot contacts syncing properly
- [ ] Google Meet links generated correctly
- [ ] No API errors in logs
- [ ] Database connections stable

### ✅ Weekly Checks

- [ ] Review error logs
- [ ] Verify HubSpot deals tracking correctly
- [ ] Check email delivery rates (SendGrid dashboard)
- [ ] Check WhatsApp delivery rates (Twilio dashboard)
- [ ] Monitor database size growth
- [ ] Test end-to-end workflow

---

## Troubleshooting

### Google Meet Link Not Generated

1. Check `.env`:
   - [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` is valid JSON
   - [ ] `GOOGLE_CALENDAR_ID` is correct email
2. Check Google Cloud:
   - [ ] Service account has calendar.insert permission
   - [ ] Consultant's calendar shared with service account
3. Check logs:
   ```bash
   npm run dev 2>&1 | grep -i "google\|meet"
   ```

### HubSpot Not Syncing

1. Check `.env`:
   - [ ] `HUBSPOT_PRIVATE_APP_TOKEN` is correct
2. Check HubSpot:
   - [ ] Private app has correct scopes
   - [ ] Token hasn't expired
3. Check logs:
   ```bash
   npm run dev 2>&1 | grep -i "hubspot"
   ```

### Scheduler Not Running

1. Check server logs for startup:
   - [ ] "Appointment scheduler started" message
2. Check logs every 10 minutes:
   - [ ] "Running appointment reminder scheduler"
   - [ ] "Pending reminders processed"
3. Restart application if needed

---

## Rollback Plan

If issues occur after deployment:

1. [ ] SSH into Hostinger
2. [ ] Stop Node.js application (Hostinger control panel)
3. [ ] Revert to previous version:
   ```bash
   git checkout previous-tag
   npm ci --omit=dev
   npm run build
   ```
4. [ ] Restart application
5. [ ] Verify working
6. [ ] Debug issue before re-deploying

---

## Success Criteria

✅ **Deployment is successful when:**

- [ ] All 3 services running (Google Meet, HubSpot, Scheduler)
- [ ] First appointment creates real Google Meet link
- [ ] First qualification syncs to HubSpot
- [ ] Scheduler sends reminders on schedule
- [ ] Zero errors in production logs after 24h
- [ ] Email delivery rate > 99%
- [ ] WhatsApp delivery rate > 95%
- [ ] Frontend can book appointments successfully
- [ ] Sales team can view leads in HubSpot

---

**Phase 5 Deployment Status: READY**

All code is tested, built, and ready for production deployment to Hostinger.

Follow this checklist in order for successful deployment.

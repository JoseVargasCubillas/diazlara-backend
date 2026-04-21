# Postman Collection & Environment

Este directorio contiene los archivos de Postman para probar toda la API de Díaz Lara Backend.

## Archivos

1. **Diaz_Lara_API.postman_collection.json** - Colección completa con todas las peticiones
2. **Diaz_Lara_API.postman_environment.json** - Environment con variables por defecto

## Instalación

### Opción 1: Importar en Postman Desktop

1. Abre **Postman Desktop**
2. Click en **Import** (esquina superior izquierda)
3. Selecciona **Upload Files**
4. Sube `Diaz_Lara_API.postman_collection.json`
5. Haz lo mismo con `Diaz_Lara_API.postman_environment.json`

### Opción 2: Importar vía URL

1. En Postman, Click **Import** → **Link**
2. Copia la URL del archivo JSON desde GitHub
3. Importa el archivo

## Configuración

Antes de hacer peticiones, **selecciona el environment**:

1. Click en la lista desplegable arriba a la derecha (donde dice "No Environment")
2. Selecciona **"Díaz Lara Backend - Development"**

### Variables Disponibles

El environment incluye estas variables que se rellenan automáticamente:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `base_url` | URL base de la API | `http://localhost:3000/api` |
| `token` | JWT del consultor (se llena al login) | `eyJhbG...` |
| `cliente_id` | ID del cliente (se llena al crear lead) | `550e8400...` |
| `consultor_id` | ID del consultor (se llena al listar) | `660e8400...` |
| `cita_id` | ID de la cita (se llena al crear cita) | `770e8400...` |
| `qualification_id` | ID de la calificación | `880e8400...` |

## Flujo Recomendado de Pruebas

### 1. **Autenticación**
```
1. Login - Consultant
   - Ingresa email: contacto@diazlara.mx
   - Ingresa password: (la del consultor)
   - Se guardará automáticamente el token en {{token}}
```

### 2. **Crear Lead (Cliente)**
```
2. Create Lead
   - Completa los datos del formulario
   - Se guardará automáticamente cliente_id en {{cliente_id}}
```

### 3. **Disponibilidad**
```
3. Get All Consultants
   - Se guardará automáticamente consultor_id en {{consultor_id}}

4. Get Available Slots for Date
   - Usa la fecha que prefieras (ej: 2026-04-25)
   - Verá los slots disponibles de 15 minutos
```

### 4. **Crear Cita (Appointment)**
```
5. Create Appointment
   - Usa una fecha/hora de los slots disponibles
   - Se guardará automáticamente cita_id en {{cita_id}}
   - Verá el Google Meet link generado
```

### 5. **Calificar Cita (Qualification)**
```
6. Create Qualification
   - Usa el cita_id del paso anterior
   - Selecciona resultado: "caliente", "tibio", "frio", "no_aplica"
   - Selecciona score_interes: "alto", "medio", "bajo"
```

### 6. **Administración**
```
7. Update Appointment Status
   - Cambia estado a "confirmada", "completada", "cancelada", "no_show"

8. Get Profile (consultor)
   - Ver perfil del consultor autenticado
```

## Estructura de la Colección

```
Díaz Lara Backend API
├── Authentication (6 endpoints)
│   ├── Login
│   ├── Logout
│   ├── Get Profile
│   ├── Update Profile
│   ├── Change Password
│   └── List All Consultants
├── Leads (2 endpoints)
│   ├── Create Lead
│   └── Get Lead Details
├── Availability (4 endpoints)
│   ├── Get All Consultants
│   ├── Get Consultant By ID
│   ├── Get Available Slots for Date
│   └── Get Calendar - Next Available Dates
├── Appointments (6 endpoints)
│   ├── Create Appointment
│   ├── Get Appointment Details
│   ├── Get Client Appointments
│   ├── Get Consultant Appointments
│   ├── Get Appointments by Date Range
│   ├── Update Appointment Status
│   └── Cancel Appointment
├── Qualifications (4 endpoints)
│   ├── Create Qualification
│   ├── Get Qualification by ID
│   ├── Get Qualification by Appointment
│   └── Export Qualification to HubSpot
└── Webhooks (1 endpoint)
    └── Twilio WhatsApp Status
```

**Total: 27 endpoints**

## Autenticación

### Endpoints Públicos (No requieren token)
- `POST /leads` - Crear lead
- `GET /availability/consultants` - Listar consultores
- `GET /availability/consultants/:id/slots` - Obtener slots
- `GET /availability/consultants/:id/calendar` - Calendario
- `POST /appointments` - Crear cita
- `GET /appointments/:id` - Obtener cita
- `GET /appointments` - Listar citas
- `PATCH /appointments/:id` - Actualizar cita

### Endpoints Privados (Requieren token)
- Todos los endpoints en `/admin/...`
- `POST /qualifications` - Crear calificación
- `GET /qualifications/...` - Obtener calificación
- `DELETE /appointments/:id` - Cancelar cita

## Tips y Trucos

### 1. **Copiar IDs entre peticiones**
Las peticiones automáticamente guardan IDs en variables después de completarse:
- Login → guarda `token`
- Create Lead → guarda `cliente_id`
- Get All Consultants → guarda `consultor_id`
- Create Appointment → guarda `cita_id`

### 2. **Tests automáticos**
Algunos endpoints tienen scripts de "test" que extraen datos:
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set('token', jsonData.token);
}
```

### 3. **Variables dinámicas**
Puedes usar variables en cualquier parte de la petición:
- URL: `{{base_url}}/leads/{{cliente_id}}`
- Headers: `Authorization: Bearer {{token}}`
- Body: `{"cliente_id": "{{cliente_id}}"}`

### 4. **Date Range Queries**
Para obtener citas en un rango de fechas:
```
GET /appointments?consultor_id={{consultor_id}}&from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z
```

### 5. **Cambiar Base URL**
Para cambiar a producción, edita el environment:
```
base_url = https://api.diazlara.mx/api
```

## Ejemplo Completo

```
1. Login
   POST /admin/login
   { "email": "contacto@diazlara.mx", "password": "..." }
   → Obtiene: token ✓

2. Create Lead
   POST /leads
   { "nombre": "Juan", "email": "juan@email.com", ... }
   → Obtiene: cliente_id ✓

3. Get Available Slots
   GET /availability/consultants/{{consultor_id}}/slots?date=2026-04-25
   → Ver slots disponibles

4. Create Appointment
   POST /appointments?cliente_id={{cliente_id}}
   { "consultor_id": "{{consultor_id}}", "fecha_hora_inicio": "...", ... }
   → Obtiene: cita_id y meet_link ✓

5. Create Qualification
   POST /qualifications
   Header: Authorization: Bearer {{token}}
   { "cita_id": "{{cita_id}}", "resultado": "caliente", ... }
   → Syncs a HubSpot ✓
```

## Solución de Problemas

### "Invalid token" o "401 Unauthorized"
- Verifica que el `token` se haya guardado correctamente
- Haz login nuevamente con las credenciales correctas
- El token expira cada 24 horas

### "Client not found"
- Crea un nuevo lead primero
- Verifica que el `cliente_id` sea correcto

### "Consultant not found"
- Verifica que el `consultor_id` sea correcto
- Obtén uno nuevo: `GET /availability/consultants`

### "Time slot is not available"
- Verifica que el slot esté disponible: `GET /availability/consultants/:id/slots`
- Evita slots con conflictos de citas existentes

### "Google Meet link not generated"
- Verifica que `GOOGLE_SERVICE_ACCOUNT_JSON` esté configurado en `.env`
- Comprueba que el consultor tenga acceso a Google Calendar

## Support

Para más detalles sobre endpoints y parámetros, ver:
- `docs/API.md` - Documentación completa de API
- `PHASE5_IMPLEMENTATION.md` - Setup de Google Meet y HubSpot
- `DEPLOYMENT_CHECKLIST_PHASE5.md` - Guía de deployment

---

**Versión:** 1.0.0  
**Última actualización:** 21 de abril de 2026

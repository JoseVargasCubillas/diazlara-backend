# Díaz Lara Backend API - Documentación

Documentación completa de endpoints de la API REST para el sistema de agendamiento de sesiones estratégicas.

**Base URL:** `https://api.diazlara.mx/api`  
**Versión:** 1.0.0

## Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [Leads (Contactos)](#leads)
3. [Disponibilidad y Calendarios](#disponibilidad)
4. [Citas (Appointments)](#citas)
5. [Calificaciones](#calificaciones)
6. [Admin](#admin)
7. [Códigos de Error](#códigos-de-error)

---

## Autenticación

La API usa **JWT (JSON Web Tokens)** para autenticar consultores. Los clientes no requieren autenticación.

### Flujo de Autenticación

1. Consultor se autentica con `POST /api/admin/login`
2. Recibe un token JWT válido por 24 horas
3. Incluye el token en el header: `Authorization: Bearer {token}`

### Headers Requeridos

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

---

## Leads

### POST /api/leads
Crear un nuevo lead/prospecto desde el formulario web.

**Autenticación:** No requerida

**Request Body:**
```json
{
  "nombre": "string (requerido, 2-100 caracteres)",
  "apellido": "string (opcional)",
  "email": "string (requerido, email válido)",
  "telefono_whatsapp": "string (formato: 5212345678)",
  "empresa": "string (opcional)",
  "puesto": "string (opcional)",
  "servicios": ["string array (opcional)"],
  "origen": "web|masterclass|referido (default: web)"
}
```

**Ejemplo de Request:**
```json
{
  "nombre": "Juan",
  "apellido": "García",
  "email": "juan@empresa.com",
  "telefono_whatsapp": "5551234567",
  "empresa": "Tech Solutions SA",
  "puesto": "Director General",
  "servicios": ["Impuestos y planeación fiscal", "Planeación patrimonial"],
  "origen": "web"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "nombre": "Juan",
    "email": "juan@empresa.com",
    "created_at": "2026-04-21T14:30:00Z"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

**Posibles Errores:**
- `400` - Campos requeridos faltantes o inválidos
- `409` - Email ya existe en el sistema

---

### GET /api/leads/:id
Obtener detalles de un lead (admin only)

**Autenticación:** JWT requerido

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "nombre": "Juan",
    "apellido": "García",
    "email": "juan@empresa.com",
    "telefono_whatsapp": "5551234567",
    "empresa": "Tech Solutions SA",
    "puesto": "Director General",
    "origen": "web",
    "created_at": "2026-04-21T14:30:00Z"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## Disponibilidad

### GET /api/availability/consultants
Obtener lista de consultores activos.

**Autenticación:** No requerida

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "nombre": "Diego",
      "apellido": "Díaz",
      "email": "diego@diazlara.mx",
      "especialidad": "Consultoría Fiscal"
    }
  ],
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

### GET /api/availability/consultants/:id/slots
Obtener slots disponibles de 15 minutos para un consultor en una fecha específica.

**Autenticación:** No requerida

**Query Parameters:**
- `date` (requerido): Fecha en formato `YYYY-MM-DD`
- `duration` (opcional): Duración del slot en minutos: `15`, `30`, o `60` (default: `15`)
- `timezone` (opcional): Zona horaria (default: `America/Mexico_City`)

**Ejemplo:**
```
GET /api/availability/consultants/550e8400-e29b-41d4-a716-446655440000/slots?date=2026-04-25&duration=15
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "consultor_id": "550e8400-e29b-41d4-a716-446655440000",
    "consultor_nombre": "Diego Díaz",
    "fecha": "2026-04-25",
    "timezone": "America/Mexico_City",
    "slots": [
      {
        "inicio": "2026-04-25T09:00:00Z",
        "fin": "2026-04-25T09:15:00Z",
        "disponible": true
      },
      {
        "inicio": "2026-04-25T09:15:00Z",
        "fin": "2026-04-25T09:30:00Z",
        "disponible": true
      },
      {
        "inicio": "2026-04-25T10:00:00Z",
        "fin": "2026-04-25T10:15:00Z",
        "disponible": false,
        "razon": "appointment"
      }
    ],
    "available_count": 9
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

### GET /api/availability/consultants/:id/calendar
Obtener próximas fechas disponibles con conteo de slots.

**Query Parameters:**
- `days` (opcional): Número de días a considerar (default: `30`)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "consultor_id": "550e8400-e29b-41d4-a716-446655440000",
    "next_available_dates": [
      {
        "date": "2026-04-22T00:00:00Z",
        "slotCount": 36
      },
      {
        "date": "2026-04-23T00:00:00Z",
        "slotCount": 32
      }
    ]
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## Citas

### POST /api/appointments
Agendar una nueva sesión estratégica.

**Autenticación:** No requerida

**Query Parameters:**
- `cliente_id` (requerido): UUID del cliente

**Request Body:**
```json
{
  "cliente_id": "string UUID",
  "consultor_id": "string UUID (requerido)",
  "fecha_hora_inicio": "ISO8601 timestamp (requerido)",
  "fecha_hora_fin": "ISO8601 timestamp (requerido, 15 min después del inicio)",
  "notas_cliente": "string (opcional)"
}
```

**Ejemplo:**
```json
{
  "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
  "consultor_id": "660e8400-e29b-41d4-a716-446655440000",
  "fecha_hora_inicio": "2026-04-25T10:00:00Z",
  "fecha_hora_fin": "2026-04-25T10:15:00Z",
  "notas_cliente": "Interesado en planeación fiscal"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
    "consultor_id": "660e8400-e29b-41d4-a716-446655440000",
    "fecha_hora_inicio": "2026-04-25T10:00:00Z",
    "fecha_hora_fin": "2026-04-25T10:15:00Z",
    "estado": "pendiente",
    "meet_link": "https://meet.google.com/xxx-yyyy-zzz",
    "created_at": "2026-04-21T14:30:00Z"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

**Automáticamente se enviarán:**
- Email de confirmación al cliente
- Mensaje WhatsApp de confirmación (si tiene teléfono registrado)

---

### GET /api/appointments/:id
Obtener detalles de una cita.

**Autenticación:** No requerida

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "cliente_id": "550e8400-e29b-41d4-a716-446655440000",
    "consultor_id": "660e8400-e29b-41d4-a716-446655440000",
    "fecha_hora_inicio": "2026-04-25T10:00:00Z",
    "fecha_hora_fin": "2026-04-25T10:15:00Z",
    "estado": "pendiente",
    "meet_link": "https://meet.google.com/xxx-yyyy-zzz",
    "created_at": "2026-04-21T14:30:00Z"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

### GET /api/appointments
Obtener citas por cliente o consultor.

**Query Parameters:**
- `cliente_id` O `consultor_id` (uno requerido)
- `from` (opcional): Fecha inicio en ISO8601
- `to` (opcional): Fecha fin en ISO8601

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { /* appointment objects */ }
  ],
  "count": 5,
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

### PATCH /api/appointments/:id
Actualizar estado de una cita.

**Autenticación:** JWT requerido para cambios sensibles

**Request Body:**
```json
{
  "estado": "pendiente|confirmada|completada|cancelada|no_show"
}
```

**Estados válidos:**
- `pendiente` - Cita creada, esperando confirmación
- `confirmada` - Cliente/Consultor confirmó asistencia
- `completada` - Llamada completada
- `cancelada` - Cita cancelada
- `no_show` - Cliente no asistió

---

### DELETE /api/appointments/:id
Cancelar una cita.

**Autenticación:** JWT requerido

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Appointment cancelled",
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## Calificaciones

### POST /api/qualifications
Crear o actualizar calificación de un lead después de la llamada.

**Autenticación:** JWT requerido (consultant)

**Request Body:**
```json
{
  "cita_id": "string UUID (requerido)",
  "resultado": "caliente|tibio|frio|no_aplica (requerido)",
  "score_interes": "alto|medio|bajo (requerido)",
  "notas_internas": "string (opcional)"
}
```

**Significado de Resultados:**
- `caliente` - Lead muy interesado, alto potencial de conversión
- `tibio` - Lead moderadamente interesado
- `frio` - Lead poco interesado
- `no_aplica` - No aplica calificación

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "cita_id": "770e8400-e29b-41d4-a716-446655440000",
    "resultado": "caliente",
    "score_interes": "alto",
    "exportado_hubspot": false,
    "created_at": "2026-04-25T11:00:00Z"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

### GET /api/qualifications/:id
Obtener detalles de una calificación.

**Autenticación:** JWT requerido

---

### POST /api/qualifications/:id/export-hubspot
Exportar manualmente una calificación a HubSpot.

**Autenticación:** JWT requerido (super_admin)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Qualification exported to HubSpot",
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## Admin

### POST /api/admin/login
Autenticar consultor.

**Request Body:**
```json
{
  "email": "string (requerido)",
  "password": "string (requerido, mín 6 caracteres)"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "consultor": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "nombre": "Diego",
    "apellido": "Díaz",
    "email": "diego@diazlara.mx",
    "especialidad": "Consultoría Fiscal"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

**Errores:**
- `401` - Email o contraseña inválidos

---

### POST /api/admin/logout
Cerrar sesión (principalmente para limpiar token en frontend).

**Autenticación:** JWT requerido

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully",
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

### GET /api/admin/profile
Obtener perfil actual del consultor.

**Autenticación:** JWT requerido

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "nombre": "Diego",
    "apellido": "Díaz",
    "email": "diego@diazlara.mx",
    "especialidad": "Consultoría Fiscal",
    "activo": true,
    "created_at": "2026-01-01T00:00:00Z"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

### PATCH /api/admin/profile
Actualizar perfil del consultor.

**Autenticación:** JWT requerido

**Request Body:**
```json
{
  "nombre": "string (opcional)",
  "apellido": "string (opcional)",
  "especialidad": "string (opcional)"
}
```

---

### POST /api/admin/change-password
Cambiar contraseña del consultor.

**Autenticación:** JWT requerido

**Request Body:**
```json
{
  "currentPassword": "string (requerido)",
  "newPassword": "string (requerido, mín 6 caracteres)",
  "confirmPassword": "string (requerido, debe coincidir)"
}
```

---

### GET /api/admin/consultants
Obtener lista de todos los consultores.

**Autenticación:** JWT requerido (super_admin)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "nombre": "Diego",
      "apellido": "Díaz",
      "email": "diego@diazlara.mx",
      "especialidad": "Consultoría Fiscal",
      "activo": true,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## Códigos de Error

| Código | Mensaje | Descripción |
|--------|---------|-------------|
| 400 | Bad Request | Validación fallida o parámetros inválidos |
| 401 | Unauthorized | Token inválido, expirado o credenciales incorrectas |
| 404 | Not Found | Recurso no encontrado |
| 409 | Conflict | El recurso ya existe (ej. email duplicado, slot no disponible) |
| 500 | Internal Server Error | Error del servidor |

**Formato de respuesta de error:**
```json
{
  "error": "Mensaje de error",
  "errors": {
    "campo": "Mensaje de error específico del campo"
  },
  "timestamp": "2026-04-21T14:30:00Z"
}
```

---

## Flujos Principales

### Flujo de Agendamiento

1. **Cliente completa formulario → POST /api/leads**
   - Se crea lead en base de datos
   - Se envía email de bienvenida
   
2. **Frontend obtiene consultores → GET /api/availability/consultants**
   - Muestra opciones de consultores

3. **Frontend obtiene slots → GET /api/availability/consultants/:id/slots?date=YYYY-MM-DD**
   - Muestra calendario de disponibilidad

4. **Cliente selecciona slot → POST /api/appointments**
   - Se crea cita
   - Se genera Google Meet link
   - Se envía email + WhatsApp de confirmación

5. **Consultor califica lead → POST /api/qualifications**
   - Consultor inicia sesión con JWT
   - Califica el lead post-llamada

### Flujo de Consultor

1. **Consultor inicia sesión → POST /api/admin/login**
   - Recibe JWT token

2. **Consultor consulta su calendario → GET /api/appointments?consultor_id=xxx**
   - Ver citas próximas

3. **Después de llamada → POST /api/qualifications**
   - Calificar lead con resultado y puntuación

---

## Notas

- Todos los timestamps están en UTC (Z)
- Los teléfonos deben estar en formato México: `5512345678`
- Los emails deben ser válidos y únicos
- Los UUIDs se generan automáticamente en el servidor
- Las citas se crean automáticamente con estado `pendiente`
- Los emails/WhatsApp se envían automáticamente según configuración

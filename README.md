# Díaz Lara Backend API

Backend para el sistema de agendamiento de sesiones estratégicas de Díaz Lara Consultores.

## Stack Tecnológico

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Lenguaje:** TypeScript
- **Base de Datos:** MySQL 8.x
- **Autenticación:** JWT
- **Validación:** Joi
- **Email:** SendGrid
- **WhatsApp:** Twilio
- **Calendario:** Google Calendar API

## Requisitos Previos

- Node.js 18 o superior
- MySQL 8.x
- npm o yarn

## Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/your-org/diazlara-backend.git
   cd diazlara-backend
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   # Editar .env con tus valores
   ```

4. **Crear base de datos**
   ```bash
   mysql -h localhost -u root < database/migrations/001_initial_schema.sql
   ```

5. **Iniciar en desarrollo**
   ```bash
   npm run dev
   ```

El servidor estará disponible en `http://localhost:3000`

## Scripts Disponibles

```bash
# Desarrollo con auto-reload
npm run dev

# Compilar TypeScript a JavaScript
npm run build

# Iniciar en producción
npm start

# Ejecutar migraciones de BD
npm run migrate

# Ejecutar tests
npm test

# Ejecutar tests en modo watch
npm test:watch

# Linting
npm run lint
npm run lint:fix
```

## Estructura del Proyecto

```
src/
├── index.ts               # Punto de entrada
├── app.ts                 # Configuración Express
├── config/                # Configuraciones
│   ├── database.ts
│   ├── environment.ts
│   └── logger.ts
├── routes/                # Rutas de la API
├── controllers/           # Controladores de lógica
├── services/              # Servicios reutilizables
├── middleware/            # Middlewares Express
├── database/
│   ├── migrations/        # Scripts SQL
│   └── queries/           # Queries reutilizables
├── types/                 # Interfaces TypeScript
└── utils/                 # Utilidades
```

## API Endpoints

### Leads
- `POST /api/leads` - Crear nuevo lead
- `GET /api/leads/:id` - Obtener detalles del lead

### Disponibilidad
- `GET /api/availability/consultants` - Listar consultores
- `GET /api/availability/consultants/:id/slots?date=YYYY-MM-DD` - Slots disponibles

### Citas
- `POST /api/appointments` - Agendar cita
- `GET /api/appointments/:id` - Obtener cita
- `PATCH /api/appointments/:id` - Actualizar cita

### Calificaciones
- `POST /api/qualifications` - Crear calificación
- `POST /api/qualifications/:id/export-hubspot` - Exportar a HubSpot

### Admin
- `POST /api/admin/login` - Login de consultor
- `POST /api/admin/logout` - Logout
- `GET /api/admin/consultants` - Listar consultores

### Webhooks
- `POST /api/webhooks/twilio` - Actualización de estado WhatsApp
- `POST /api/webhooks/hubspot` - Webhooks de HubSpot

## Configuración de Integraciones

### SendGrid
1. Crear cuenta en [SendGrid](https://sendgrid.com)
2. Generar API key
3. Configurar en `.env`: `SENDGRID_API_KEY`

### Twilio WhatsApp
1. Crear cuenta en [Twilio](https://www.twilio.com)
2. Obtener Account SID, Auth Token y WhatsApp number
3. Configurar en `.env`

### Google Calendar
1. Crear proyecto en [Google Cloud Console](https://console.cloud.google.com)
2. Habilitar Google Calendar API
3. Crear service account
4. Descargar JSON y configurar en `.env`

### HubSpot
1. Crear cuenta en [HubSpot](https://www.hubspot.com)
2. Generar private app token
3. Configurar en `.env`

## Despliegue en Hostinger

### Preguntas Frecuentes

**¿Cómo despliego?**
1. Crear app Node.js en panel de Hostinger
2. Clonar repositorio en el servidor
3. Instalar dependencias: `npm ci --omit=dev`
4. Compilar: `npm run build`
5. Ejecutar migraciones: `npm run migrate`
6. Hostinger reiniciará automáticamente

**¿Cómo configuro variables de entorno?**
En el panel de Hostinger, añadir variables en "Environment Variables" o crear `.env` en el directorio raíz.

**¿Dónde apunto mi dominio?**
- Frontend: `https://diazlara.mx` → Hosting estático
- Backend: `https://api.diazlara.mx` → App Node.js
- O usar subpath: `https://diazlara.mx/api`

## Desarrollo Local

### Con Docker Compose

```bash
docker-compose up -d
npm install
npm run dev
```

### Sin Docker

1. Instalar MySQL localmente
2. Crear base de datos: `CREATE DATABASE diazlara;`
3. Ejecutar migraciones
4. Configurar `.env` apuntando a localhost
5. `npm run dev`

## Testing

```bash
# Ejecutar suite de tests
npm test

# Tests con coverage
npm test -- --coverage

# Watch mode
npm test:watch
```

## Logging

El proyecto usa Pino para logging estructurado.

```typescript
import { logger } from './config/logger';

logger.info('Mensaje informativo');
logger.error('Error:', new Error('algo salió mal'));
logger.debug('Debug info');
```

Todos los logs incluyen timestamp y contexto estructurado.

## Manejo de Errores

El proyecto define clases de error personalizadas:

```typescript
import { ValidationError, NotFoundError, ConflictError } from './types';

throw new ValidationError('Campo inválido', { email: 'Email duplicado' });
throw new NotFoundError('Recurso no encontrado');
throw new ConflictError('Email ya existe');
```

## Contribuir

1. Fork del repositorio
2. Crear rama feature: `git checkout -b feature/nombre`
3. Commit cambios: `git commit -m 'Add feature'`
4. Push: `git push origin feature/nombre`
5. Pull Request

## Licencia

ISC

## Soporte

Para soporte, contacta a [ti@diegodiaz.mx](mailto:ti@diegodiaz.mx)

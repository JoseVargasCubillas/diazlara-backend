-- ============================================
-- Díaz Lara - MySQL Schema
-- Run migrations in order, only once
-- ============================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE DATABASE IF NOT EXISTS diazlara CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE diazlara;

-- ============================================
-- Migration Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_migration_name (name)
) ENGINE=InnoDB;

-- ============================================
-- 1. CLIENTES
-- Leads from web form
-- ============================================

CREATE TABLE IF NOT EXISTS CLIENTES (
  id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  nombre             VARCHAR(100)  NOT NULL,
  apellido           VARCHAR(100),
  email              VARCHAR(255)  NOT NULL,
  telefono_whatsapp  VARCHAR(20),
  empresa            VARCHAR(150),
  puesto             VARCHAR(100),
  origen             VARCHAR(50)   DEFAULT 'web',
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email),
  INDEX idx_created_at (created_at),
  INDEX idx_origen (origen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. CONSULTORES
-- Internal consultant team
-- ============================================

CREATE TABLE IF NOT EXISTS CONSULTORES (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  nombre          VARCHAR(100) NOT NULL,
  apellido        VARCHAR(100),
  email           VARCHAR(255) NOT NULL,
  especialidad    VARCHAR(150),
  password_hash   VARCHAR(255),
  api_token       CHAR(36),
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_consultor_email (email),
  UNIQUE KEY uq_api_token (api_token),
  INDEX idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. DISPONIBILIDAD
-- Recurring weekly availability
-- dia_semana: 0=Sunday...6=Saturday
-- ============================================

CREATE TABLE IF NOT EXISTS DISPONIBILIDAD (
  id            CHAR(36)   NOT NULL DEFAULT (UUID()),
  consultor_id  CHAR(36)   NOT NULL,
  dia_semana    TINYINT    NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio   TIME       NOT NULL,
  hora_fin      TIME       NOT NULL,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT fk_disp_consultor FOREIGN KEY (consultor_id) REFERENCES CONSULTORES(id) ON DELETE CASCADE,
  UNIQUE KEY uq_disp_consultor_dia (consultor_id, dia_semana),
  INDEX idx_consultor_id (consultor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. BLOQUEOS
-- Vacation, blocked time, exceptions
-- ============================================

CREATE TABLE IF NOT EXISTS BLOQUEOS (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  consultor_id  CHAR(36)     NOT NULL,
  inicio        TIMESTAMP    NOT NULL,
  fin           TIMESTAMP    NOT NULL,
  motivo        VARCHAR(255),
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_bloqueo_consultor FOREIGN KEY (consultor_id) REFERENCES CONSULTORES(id) ON DELETE CASCADE,
  INDEX idx_consultor_id (consultor_id),
  INDEX idx_fecha_range (inicio, fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. CITAS
-- Booked strategic sessions
-- estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_show'
-- ============================================

CREATE TABLE IF NOT EXISTS CITAS (
  id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
  cliente_id          CHAR(36)     NOT NULL,
  consultor_id        CHAR(36)     NOT NULL,
  fecha_hora_inicio   TIMESTAMP    NOT NULL,
  fecha_hora_fin      TIMESTAMP    NOT NULL,
  estado              VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  meet_link           VARCHAR(500),
  notas_cliente       TEXT,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cita_cliente    FOREIGN KEY (cliente_id)   REFERENCES CLIENTES(id) ON DELETE CASCADE,
  CONSTRAINT fk_cita_consultor  FOREIGN KEY (consultor_id) REFERENCES CONSULTORES(id),
  INDEX idx_cliente_id (cliente_id),
  INDEX idx_consultor_id (consultor_id),
  INDEX idx_fecha_hora (fecha_hora_inicio),
  INDEX idx_estado (estado),
  INDEX idx_fecha_range (fecha_hora_inicio, fecha_hora_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. CALIFICACIONES
-- Lead scoring after call
-- resultado: 'caliente' | 'tibio' | 'frio' | 'no_aplica'
-- score_interes: 'alto' | 'medio' | 'bajo'
-- ============================================

CREATE TABLE IF NOT EXISTS CALIFICACIONES (
  id                  CHAR(36)    NOT NULL DEFAULT (UUID()),
  cita_id             CHAR(36)    NOT NULL,
  consultor_id        CHAR(36)    NOT NULL,
  resultado           VARCHAR(20),
  notas_internas      TEXT,
  score_interes       VARCHAR(10),
  exportado_hubspot   TINYINT(1)  NOT NULL DEFAULT 0,
  hubspot_export_at   TIMESTAMP   NULL,
  created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_calificacion_cita (cita_id),
  CONSTRAINT fk_calif_cita      FOREIGN KEY (cita_id)      REFERENCES CITAS(id) ON DELETE CASCADE,
  CONSTRAINT fk_calif_consultor FOREIGN KEY (consultor_id) REFERENCES CONSULTORES(id),
  INDEX idx_resultado (resultado),
  INDEX idx_exportado_hubspot (exportado_hubspot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. PLANTILLAS
-- Reusable email/WhatsApp templates
-- canal: 'email' | 'whatsapp'
-- tipo_evento: 'confirmacion' | 'recordatorio' | 'seguimiento' | 'cancelacion'
-- ============================================

CREATE TABLE IF NOT EXISTS PLANTILLAS (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  canal        VARCHAR(20)  NOT NULL,
  tipo_evento  VARCHAR(50)  NOT NULL,
  nombre       VARCHAR(150) NOT NULL,
  contenido    TEXT         NOT NULL,
  activa       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plantilla (canal, tipo_evento),
  INDEX idx_canal (canal),
  INDEX idx_activa (activa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. NOTIFICACIONES
-- Notification sending log
-- estado: 'pendiente' | 'enviado' | 'fallido'
-- ============================================

CREATE TABLE IF NOT EXISTS NOTIFICACIONES (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  cita_id      CHAR(36)     NOT NULL,
  canal        VARCHAR(20)  NOT NULL,
  tipo         VARCHAR(50)  NOT NULL,
  estado       VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
  contenido    TEXT,
  enviado_at   TIMESTAMP    NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_notif_cita FOREIGN KEY (cita_id) REFERENCES CITAS(id) ON DELETE CASCADE,
  INDEX idx_cita_id (cita_id),
  INDEX idx_estado (estado),
  INDEX idx_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Seed Data
-- ============================================

-- Initial consultant
INSERT IGNORE INTO CONSULTORES (nombre, apellido, email, especialidad, activo) VALUES
  ('Diego', 'Díaz', 'contacto@diazlara.mx', 'Consultoría Fiscal y Financiera', 1);

-- Default availability: Monday to Friday, 9am to 6pm
INSERT IGNORE INTO DISPONIBILIDAD (consultor_id, dia_semana, hora_inicio, hora_fin, activo)
SELECT id, dia_semana, '09:00:00', '18:00:00', 1
FROM (
  SELECT (SELECT id FROM CONSULTORES WHERE email = 'contacto@diazlara.mx' LIMIT 1) as id, 1 as dia_semana
  UNION SELECT (SELECT id FROM CONSULTORES WHERE email = 'contacto@diazlara.mx' LIMIT 1), 2
  UNION SELECT (SELECT id FROM CONSULTORES WHERE email = 'contacto@diazlara.mx' LIMIT 1), 3
  UNION SELECT (SELECT id FROM CONSULTORES WHERE email = 'contacto@diazlara.mx' LIMIT 1), 4
  UNION SELECT (SELECT id FROM CONSULTORES WHERE email = 'contacto@diazlara.mx' LIMIT 1), 5
) days
ON DUPLICATE KEY UPDATE hora_inicio=VALUES(hora_inicio);

-- Default templates
INSERT IGNORE INTO PLANTILLAS (canal, tipo_evento, nombre, contenido, activa) VALUES
  ('email', 'confirmacion', 'Confirmación de sesión estratégica',
   'Hola {{nombre}},\n\nTu sesión estratégica con Díaz Lara Consultores está confirmada.\n\n📅 Fecha: {{fecha}}\n⏰ Hora: {{hora}}\n\n🔗 Acceder a reunión: {{meet_link}}\n\nEsta es una sesión exploratoria de 15 minutos. Si tienes preguntas, no dudes en escribirnos.\n\nSaludos,\nEquipo Díaz Lara',
   1),

  ('whatsapp', 'confirmacion', 'Confirmación WhatsApp',
   'Hola {{nombre}}! Tu sesión está confirmada para {{fecha}} a las {{hora}}. Enlace: {{meet_link}}',
   1),

  ('email', 'recordatorio', 'Recordatorio de sesión',
   'Hola {{nombre}},\n\n⏰ Recordatorio: Tu sesión es hoy a las {{hora}}.\n\n🔗 Enlace de reunión: {{meet_link}}\n\nTe esperamos!',
   1),

  ('whatsapp', 'recordatorio', 'Recordatorio WhatsApp',
   '⏰ Recordatorio: Tu sesión es hoy a las {{hora}}. Enlace: {{meet_link}}',
   1),

  ('email', 'cancelacion', 'Cancelación de sesión',
   'Hola {{nombre}},\n\nInformamos que tu sesión estratégica ha sido cancelada.\n\nSi deseas reprogramarla, por favor contáctanos.\n\nSaludos,\nEquipo Díaz Lara',
   1);

-- Record schema migration
INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (1, '001_initial_schema');

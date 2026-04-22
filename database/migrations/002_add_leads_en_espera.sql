-- ============================================
-- Migration 002: Add LEADS_EN_ESPERA table
-- Waiting list for clients before approval
-- ============================================

-- LEADS_EN_ESPERA: Clients waiting for consultant approval
-- estado: 'pendiente' | 'aprobado' | 'rechazado'
CREATE TABLE IF NOT EXISTS LEADS_EN_ESPERA (
  id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  nombre             VARCHAR(100)  NOT NULL,
  email              VARCHAR(255)  NOT NULL,
  telefono_whatsapp  VARCHAR(20),
  empresa            VARCHAR(150),
  puesto             VARCHAR(100),
  servicios          JSON,
  estado             VARCHAR(20)   NOT NULL DEFAULT 'pendiente',
  consultor_id       CHAR(36),
  zoom_link          VARCHAR(500),
  notas_interno      TEXT,
  fecha_aprovado     TIMESTAMP     NULL,
  fecha_rechazo      TIMESTAMP     NULL,
  origen             VARCHAR(50)   DEFAULT 'web',
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_espera (email),
  CONSTRAINT fk_lead_consultor FOREIGN KEY (consultor_id) REFERENCES CONSULTORES(id) ON DELETE SET NULL,
  INDEX idx_estado (estado),
  INDEX idx_consultor_id (consultor_id),
  INDEX idx_created_at (created_at),
  INDEX idx_estado_fecha (estado, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Record schema migration
INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (2, '002_add_leads_en_espera');

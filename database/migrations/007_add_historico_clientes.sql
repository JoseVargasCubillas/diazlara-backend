-- ============================================
-- Migration 007: Add archived client history
-- ============================================

CREATE TABLE IF NOT EXISTS HISTORICO_CLIENTES (
  id                    CHAR(36)     NOT NULL DEFAULT (UUID()),
  lead_id               CHAR(36)     NULL,
  cliente_manual_id     CHAR(36)     NULL,
  cliente_id            CHAR(36)     NULL,
  cita_id               CHAR(36)     NULL,
  consultor_id          CHAR(36)     NULL,
  tipo_origen           VARCHAR(20)  NOT NULL DEFAULT 'organico',
  fuente_registro       VARCHAR(50)  NULL,
  nombre                VARCHAR(100) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  telefono_whatsapp     VARCHAR(20)  NULL,
  empresa               VARCHAR(150) NULL,
  puesto                VARCHAR(100) NULL,
  servicios             JSON         NULL,
  etiqueta              VARCHAR(50)  NOT NULL DEFAULT 'cliente_removido',
  motivo                VARCHAR(255) NULL,
  estado_lead           VARCHAR(20)  NULL,
  estado_cita           VARCHAR(20)  NULL,
  estatus_comercial     VARCHAR(20)  NULL,
  meet_link             VARCHAR(500) NULL,
  fecha_hora_inicio     TIMESTAMP    NULL,
  fecha_hora_fin        TIMESTAMP    NULL,
  archived_by           CHAR(36)     NULL,
  archived_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lead_snapshot         JSON         NULL,
  cliente_manual_snapshot JSON       NULL,
  cliente_snapshot      JSON         NULL,
  cita_snapshot         JSON         NULL,
  PRIMARY KEY (id),
  INDEX idx_email (email),
  INDEX idx_etiqueta (etiqueta),
  INDEX idx_archived_at (archived_at),
  INDEX idx_lead_id (lead_id),
  INDEX idx_cliente_manual_id (cliente_manual_id),
  INDEX idx_cliente_id (cliente_id),
  INDEX idx_cita_id (cita_id),
  INDEX idx_consultor_id (consultor_id),
  INDEX idx_tipo_origen (tipo_origen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS CLIENTES_CONSULTOR (
  id                    CHAR(36)     NOT NULL DEFAULT (UUID()),
  consultor_id          CHAR(36)     NOT NULL,
  nombre                VARCHAR(100) NOT NULL,
  apellido              VARCHAR(100) NULL,
  email                 VARCHAR(255) NOT NULL,
  telefono_whatsapp     VARCHAR(20)  NULL,
  empresa               VARCHAR(150) NULL,
  puesto                VARCHAR(100) NULL,
  servicios             JSON         NULL,
  fuente_registro       VARCHAR(50)  NOT NULL DEFAULT 'manual_consultor',
  estatus_comercial     VARCHAR(20)  NOT NULL DEFAULT 'prospecto',
  notas                 TEXT         NULL,
  activo                TINYINT(1)   NOT NULL DEFAULT 1,
  created_by            CHAR(36)     NOT NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cliente_consultor_email (email),
  INDEX idx_consultor_id (consultor_id),
  INDEX idx_created_by (created_by),
  INDEX idx_activo (activo),
  CONSTRAINT fk_cliente_consultor_consultor
    FOREIGN KEY (consultor_id) REFERENCES CONSULTORES(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (7, '007_add_historico_clientes');

-- ============================================
-- 008 - Diagnosticos de clientes
-- Guarda el formulario maestro que llena el consultor por cliente.
-- ============================================

USE diazlara;

CREATE TABLE IF NOT EXISTS DIAGNOSTICOS_CLIENTES (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  cliente_ref_tipo VARCHAR(30)  NOT NULL,
  cliente_ref_id   CHAR(36)     NOT NULL,
  consultor_id     CHAR(36)     NOT NULL,
  estado           VARCHAR(20)  NOT NULL DEFAULT 'borrador',
  respuestas       JSON         NOT NULL,
  resumen          TEXT         NULL,
  saved_at         TIMESTAMP    NULL,
  completed_at     TIMESTAMP    NULL,
  created_by       CHAR(36)     NOT NULL,
  updated_by       CHAR(36)     NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_diagnostico_cliente_ref (cliente_ref_tipo, cliente_ref_id),
  CONSTRAINT fk_diag_consultor FOREIGN KEY (consultor_id) REFERENCES CONSULTORES(id),
  CONSTRAINT fk_diag_created_by FOREIGN KEY (created_by) REFERENCES CONSULTORES(id),
  CONSTRAINT fk_diag_updated_by FOREIGN KEY (updated_by) REFERENCES CONSULTORES(id),
  INDEX idx_cliente_ref (cliente_ref_tipo, cliente_ref_id),
  INDEX idx_consultor_id (consultor_id),
  INDEX idx_estado (estado),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (8, '008_add_diagnosticos_clientes');

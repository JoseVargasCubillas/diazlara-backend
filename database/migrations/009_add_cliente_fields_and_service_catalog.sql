-- ============================================
-- 009 - Campos comerciales de clientes y catalogo de servicios
-- ============================================

ALTER TABLE CLIENTES_CONSULTOR
  ADD COLUMN no_cliente VARCHAR(50) NULL AFTER id,
  ADD COLUMN asesor_comercial VARCHAR(100) NULL AFTER empresa,
  ADD COLUMN evento_previo VARCHAR(150) NULL AFTER asesor_comercial,
  ADD COLUMN fecha_registro DATE NULL AFTER fuente_registro,
  ADD COLUMN importe_total DECIMAL(12,2) NULL AFTER fecha_registro,
  ADD COLUMN ene DECIMAL(12,2) NULL AFTER importe_total,
  ADD COLUMN feb DECIMAL(12,2) NULL AFTER ene,
  ADD COLUMN mar DECIMAL(12,2) NULL AFTER feb,
  ADD COLUMN abr DECIMAL(12,2) NULL AFTER mar,
  ADD COLUMN may DECIMAL(12,2) NULL AFTER abr,
  ADD COLUMN jun DECIMAL(12,2) NULL AFTER may,
  ADD COLUMN jul DECIMAL(12,2) NULL AFTER jun,
  ADD COLUMN ago DECIMAL(12,2) NULL AFTER jul,
  ADD COLUMN sep DECIMAL(12,2) NULL AFTER ago,
  ADD COLUMN oct DECIMAL(12,2) NULL AFTER sep,
  ADD COLUMN nov DECIMAL(12,2) NULL AFTER oct,
  ADD COLUMN dic DECIMAL(12,2) NULL AFTER nov,
  ADD COLUMN saldo DECIMAL(12,2) NULL AFTER dic,
  ADD COLUMN expediente VARCHAR(255) NULL AFTER saldo,
  ADD COLUMN fecha_sesion_1 DATE NULL AFTER expediente,
  ADD COLUMN fecha_sesion_2 DATE NULL AFTER fecha_sesion_1,
  ADD COLUMN observaciones TEXT NULL AFTER fecha_sesion_2,
  ADD COLUMN comentarios TEXT NULL AFTER observaciones,
  ADD COLUMN benchmark TEXT NULL AFTER comentarios,
  ADD COLUMN revision_financiera TEXT NULL AFTER benchmark,
  ADD COLUMN minuta TEXT NULL AFTER revision_financiera,
  ADD COLUMN candidato VARCHAR(100) NULL AFTER minuta,
  ADD COLUMN ct VARCHAR(100) NULL AFTER candidato,
  ADD COLUMN comentarios_ct TEXT NULL AFTER ct,
  ADD COLUMN status VARCHAR(50) NULL AFTER comentarios_ct,
  ADD COLUMN factura_1 VARCHAR(255) NULL AFTER status,
  ADD COLUMN factura_2 VARCHAR(255) NULL AFTER factura_1;

ALTER TABLE HISTORICO_CLIENTES
  ADD COLUMN no_cliente VARCHAR(50) NULL AFTER id,
  ADD COLUMN asesor_comercial VARCHAR(100) NULL AFTER empresa,
  ADD COLUMN evento_previo VARCHAR(150) NULL AFTER asesor_comercial,
  ADD COLUMN fecha_registro DATE NULL AFTER fuente_registro,
  ADD COLUMN importe_total DECIMAL(12,2) NULL AFTER fecha_registro,
  ADD COLUMN ene DECIMAL(12,2) NULL AFTER importe_total,
  ADD COLUMN feb DECIMAL(12,2) NULL AFTER ene,
  ADD COLUMN mar DECIMAL(12,2) NULL AFTER feb,
  ADD COLUMN abr DECIMAL(12,2) NULL AFTER mar,
  ADD COLUMN may DECIMAL(12,2) NULL AFTER abr,
  ADD COLUMN jun DECIMAL(12,2) NULL AFTER may,
  ADD COLUMN jul DECIMAL(12,2) NULL AFTER jun,
  ADD COLUMN ago DECIMAL(12,2) NULL AFTER jul,
  ADD COLUMN sep DECIMAL(12,2) NULL AFTER ago,
  ADD COLUMN oct DECIMAL(12,2) NULL AFTER sep,
  ADD COLUMN nov DECIMAL(12,2) NULL AFTER oct,
  ADD COLUMN dic DECIMAL(12,2) NULL AFTER nov,
  ADD COLUMN saldo DECIMAL(12,2) NULL AFTER dic,
  ADD COLUMN expediente VARCHAR(255) NULL AFTER saldo,
  ADD COLUMN fecha_sesion_1 DATE NULL AFTER expediente,
  ADD COLUMN fecha_sesion_2 DATE NULL AFTER fecha_sesion_1,
  ADD COLUMN observaciones TEXT NULL AFTER fecha_sesion_2,
  ADD COLUMN comentarios TEXT NULL AFTER observaciones,
  ADD COLUMN benchmark TEXT NULL AFTER comentarios,
  ADD COLUMN revision_financiera TEXT NULL AFTER benchmark,
  ADD COLUMN minuta TEXT NULL AFTER revision_financiera,
  ADD COLUMN candidato VARCHAR(100) NULL AFTER minuta,
  ADD COLUMN ct VARCHAR(100) NULL AFTER candidato,
  ADD COLUMN comentarios_ct TEXT NULL AFTER ct,
  ADD COLUMN status VARCHAR(50) NULL AFTER comentarios_ct,
  ADD COLUMN factura_1 VARCHAR(255) NULL AFTER status,
  ADD COLUMN factura_2 VARCHAR(255) NULL AFTER factura_1;

CREATE TABLE IF NOT EXISTS SERVICIOS_CLIENTE (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()),
  nombre      VARCHAR(150) NOT NULL,
  activo      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_servicio_cliente_nombre (nombre),
  INDEX idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO SERVICIOS_CLIENTE (nombre) VALUES
  ('REVISIÓN FISCAL INICIAL'),
  ('REVISIÓN JURÍDICA INICIAL'),
  ('ADVISORY SENIOR'),
  ('ADVISORY EXECUTIVE'),
  ('MESA ESTRATÉGICA');

CREATE TABLE IF NOT EXISTS CLIENTE_ARCHIVOS (
  id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
  cliente_manual_id   CHAR(36)     NOT NULL,
  campo               VARCHAR(50)  NULL,
  nombre_original     VARCHAR(255) NOT NULL,
  nombre_guardado     VARCHAR(255) NOT NULL,
  mime_type           VARCHAR(150) NULL,
  size_bytes          BIGINT       NOT NULL DEFAULT 0,
  relative_path       VARCHAR(500) NOT NULL,
  uploaded_by         CHAR(36)     NOT NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_cliente_manual_id (cliente_manual_id),
  INDEX idx_uploaded_by (uploaded_by),
  INDEX idx_campo (campo),
  CONSTRAINT fk_cliente_archivo_cliente
    FOREIGN KEY (cliente_manual_id) REFERENCES CLIENTES_CONSULTOR(id),
  CONSTRAINT fk_cliente_archivo_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES CONSULTORES(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (9, '009_add_cliente_fields_and_service_catalog');

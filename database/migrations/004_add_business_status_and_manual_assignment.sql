-- ============================================
-- Migration 004: Add business status support
-- ============================================

ALTER TABLE LEADS_EN_ESPERA
ADD COLUMN estatus_comercial VARCHAR(20) NOT NULL DEFAULT 'interesado' AFTER estado;

ALTER TABLE CLIENTES
ADD COLUMN estatus_comercial VARCHAR(20) NOT NULL DEFAULT 'interesado' AFTER origen;

ALTER TABLE CALIFICACIONES
ADD COLUMN estatus_comercial VARCHAR(20) NOT NULL DEFAULT 'interesado' AFTER score_interes;

INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (4, '004_add_business_status_and_manual_assignment');
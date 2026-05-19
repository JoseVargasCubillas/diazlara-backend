-- ============================================
-- Migration 006: Add consultant/admin role
-- ============================================

ALTER TABLE CONSULTORES
ADD COLUMN rol VARCHAR(20) NOT NULL DEFAULT 'consultant' AFTER activo;

UPDATE CONSULTORES
SET rol = 'consultant'
WHERE rol IS NULL OR rol = '';

INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (6, '006_add_consultor_role');

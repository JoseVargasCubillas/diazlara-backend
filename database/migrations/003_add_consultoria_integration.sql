-- ============================================
-- Migration 003: Add Consultoria integration
-- ============================================

-- Add consultoria_cliente_id column to track synced clients
ALTER TABLE LEADS_EN_ESPERA
ADD COLUMN consultoria_cliente_id INT NULL AFTER estado;

-- Record schema migration
INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (3, '003_add_consultoria_integration');

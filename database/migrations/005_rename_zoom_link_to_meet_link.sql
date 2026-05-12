-- ============================================
-- Migration 005: Rename zoom_link → meet_link in LEADS_EN_ESPERA
-- The platform now uses Google Meet exclusively (Zoom was dropped because
-- it could not host more than one participant per session reliably).
-- ============================================

-- Rename column if it still exists as zoom_link.
-- Use a guarded ALTER so the migration is idempotent.
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LEADS_EN_ESPERA'
    AND COLUMN_NAME = 'zoom_link'
);

SET @sql := IF(
  @col_exists > 0,
  'ALTER TABLE LEADS_EN_ESPERA CHANGE COLUMN zoom_link meet_link VARCHAR(500) NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Make sure the column exists even if a fresh install never created zoom_link.
SET @meet_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'LEADS_EN_ESPERA'
    AND COLUMN_NAME = 'meet_link'
);

SET @sql2 := IF(
  @meet_exists = 0,
  'ALTER TABLE LEADS_EN_ESPERA ADD COLUMN meet_link VARCHAR(500) NULL AFTER consultor_id',
  'SELECT 1'
);

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Record schema migration
INSERT IGNORE INTO schema_migrations (version, name) VALUES
  (5, '005_rename_zoom_link_to_meet_link');

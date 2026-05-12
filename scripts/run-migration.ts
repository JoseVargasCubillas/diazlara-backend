/**
 * One-shot migration runner.
 * Reads a .sql file (multiple statements supported) and applies it against the
 * configured database, then prints schema_migrations status.
 *
 * Usage: ts-node scripts/run-migration.ts database/migrations/005_rename_zoom_link_to_meet_link.sql
 */
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: ts-node scripts/run-migration.ts <path-to-sql-file>');
    process.exit(1);
  }

  const absPath = path.resolve(process.cwd(), file);
  const sql = await fs.readFile(absPath, 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    console.log(`→ Applying ${path.basename(absPath)} on ${process.env.DB_NAME}@${process.env.DB_HOST}`);
    await conn.query(sql);
    console.log('✓ Migration applied successfully');

    const [rows] = await conn.query(
      'SELECT * FROM schema_migrations ORDER BY version'
    );
    console.log('Current schema_migrations:');
    console.table(rows);

    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'LEADS_EN_ESPERA'
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME]
    );
    console.log('LEADS_EN_ESPERA columns:');
    console.table(cols);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});

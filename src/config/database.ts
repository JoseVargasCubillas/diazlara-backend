import mysql from 'mysql2/promise';
import { env } from './environment';
import { logger } from './logger';

let pool: mysql.Pool | null = null;

export async function initializeDatabase(): Promise<mysql.Pool> {
  if (pool) {
    return pool;
  }

  try {
    pool = mysql.createPool({
      host: env.DB_HOST,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      port: env.DB_PORT,
      waitForConnections: true,
      connectionLimit: env.DB_POOL_SIZE,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
      timezone: 'Z', // Use UTC
      charset: 'utf8mb4',
    });

    // Test connection
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    logger.info(`✓ Database connected: ${env.DB_NAME}@${env.DB_HOST}:${env.DB_PORT}`);

    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

export async function getDatabase(): Promise<mysql.Pool> {
  if (!pool) {
    return initializeDatabase();
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
}

export default pool;


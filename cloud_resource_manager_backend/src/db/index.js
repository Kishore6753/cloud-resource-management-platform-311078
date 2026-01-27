const { Pool } = require('pg');
const { getEnv } = require('../config/env');

const connectionString = getEnv('POSTGRES_URL', getEnv('DATABASE_URL', ''));

/**
 * NOTE:
 * The work item provides DB env vars (POSTGRES_URL, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT).
 * In this backend we primarily rely on POSTGRES_URL (or DATABASE_URL) because host is not guaranteed to be provided
 * as a separate env var.
 */
if (!connectionString) {
  // We intentionally do not throw at import time to keep local tooling (lint/docs) usable.
  // Runtime DB calls will fail with a clearer error when attempted.
  console.warn(
    'Database connection string is not set. Provide POSTGRES_URL (preferred) or DATABASE_URL.'
  );
}

const pool = new Pool({
  connectionString: connectionString || undefined,
  max: Number(getEnv('DB_POOL_MAX', '20')),
  min: Number(getEnv('DB_POOL_MIN', '0')),
  idleTimeoutMillis: Number(getEnv('DB_POOL_IDLE_MS', '30000')),
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * PUBLIC_INTERFACE
 * Execute a parameterized query safely against PostgreSQL.
 * @param {string} text SQL query string with $1, $2... placeholders
 * @param {any[]} [params] SQL parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  if (!connectionString) {
    throw new Error(
      'Database is not configured. Set POSTGRES_URL (preferred) or DATABASE_URL.'
    );
  }
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
};

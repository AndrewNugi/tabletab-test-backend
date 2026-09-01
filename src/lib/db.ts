import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = {
  query: <T extends Record<string, any> = Record<string, any>>(text: string, params?: unknown[]) =>
    pool.query<T>(text, params),
  getClient: () => pool.connect(),
};

export default db;
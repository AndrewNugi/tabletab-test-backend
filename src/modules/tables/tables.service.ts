import QRCode from 'qrcode';
import db from '../../lib/db';
import { AppError } from '../../lib/errors';

export async function getTablesForEstablishment(establishmentId: number) {
  const { rows } = await db.query(
    `SELECT t.*,
            CASE WHEN ts.id IS NOT NULL THEN ts.status::text ELSE 'idle' END AS session_status,
            ts.id AS active_session_id
     FROM tables t
     LEFT JOIN table_sessions ts ON ts.table_id = t.id AND ts.status != 'closed'
     WHERE t.establishment_id = $1 AND t.is_active = TRUE
     ORDER BY t.id`,
    [establishmentId]
  );
  return rows;
}

export async function getTableById(tableId: number, establishmentId: number) {
  const { rows } = await db.query(
    `SELECT t.*,
            CASE WHEN ts.id IS NOT NULL THEN ts.status::text ELSE 'idle' END AS session_status,
            ts.id AS active_session_id
     FROM tables t
     LEFT JOIN table_sessions ts ON ts.table_id = t.id AND ts.status != 'closed'
     WHERE t.id = $1 AND t.establishment_id = $2`,
    [tableId, establishmentId]
  );
  if (!rows[0]) throw new AppError('Table not found', 404);
  return rows[0];
}

export async function createTable(establishmentId: number, tableName?: string) {
  const { rows } = await db.query(
    `INSERT INTO tables (establishment_id, table_name) VALUES ($1, $2) RETURNING *`,
    [establishmentId, tableName || null]
  );
  const table = rows[0];
  const qrUrl = await generateAndStoreQR(table.id as number, establishmentId);
  return { ...table, qr_code_url: qrUrl };
}

export async function updateTable(
  tableId: number,
  establishmentId: number,
  data: { table_name?: string; is_active?: boolean }
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.table_name !== undefined) {
    fields.push(`table_name = $${i++}`);
    values.push(data.table_name || null);
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(data.is_active);
  }
  if (fields.length === 0) throw new AppError('No fields to update', 400);

  values.push(tableId, establishmentId);
  const { rows } = await db.query(
    `UPDATE tables SET ${fields.join(', ')}
     WHERE id = $${i++} AND establishment_id = $${i++}
     RETURNING *`,
    values
  );
  if (!rows[0]) throw new AppError('Table not found', 404);
  return rows[0];
}

export async function regenerateTableQR(tableId: number, establishmentId: number) {
  const { rows } = await db.query(
    `SELECT id, establishment_id FROM tables WHERE id = $1 AND establishment_id = $2`,
    [tableId, establishmentId]
  );
  if (!rows[0]) throw new AppError('Table not found', 404);
  const qrUrl = await generateAndStoreQR(tableId, establishmentId);
  return { id: tableId, qr_code_url: qrUrl };
}

async function generateAndStoreQR(tableId: number, establishmentId: number): Promise<string> {
  const baseUrl = process.env.QR_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/menu/${establishmentId}?table=${tableId}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2 });
  await db.query('UPDATE tables SET qr_code_url = $1 WHERE id = $2', [dataUrl, tableId]);
  return dataUrl;
}

export async function getOrCreateSession(tableId: number, establishmentId: number) {
  const existing = await getActiveSession(tableId);
  if (existing) return existing;
  return openSession(tableId, establishmentId);
}

async function getActiveSession(tableId: number) {
  const { rows } = await db.query(
    `SELECT * FROM table_sessions
     WHERE table_id = $1 AND status != 'closed'
     ORDER BY opened_at DESC LIMIT 1`,
    [tableId]
  );
  return rows[0] || null;
}

async function openSession(tableId: number, establishmentId: number) {
  await db.query(
    `UPDATE table_sessions SET status = 'closed', closed_at = NOW()
     WHERE table_id = $1 AND status != 'closed'`,
    [tableId]
  );
  const { rows } = await db.query(
    `INSERT INTO table_sessions (table_id, establishment_id) VALUES ($1, $2) RETURNING *`,
    [tableId, establishmentId]
  );
  return rows[0];
}

export async function closeSession(sessionId: number, establishmentId: number) {
  const { rows } = await db.query(
    `UPDATE table_sessions SET status = 'closed', closed_at = NOW()
     WHERE id = $1 AND establishment_id = $2 RETURNING *`,
    [sessionId, establishmentId]
  );
  return rows[0] || null;
}

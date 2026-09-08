import crypto from 'crypto';
import QRCode from 'qrcode';
import db from '../../lib/db';
import { AppError } from '../../lib/errors';

// A table's assigned_waiter_id is the authoritative "who owns this table right
// now" — set explicitly by a manager (assignWaiterToTable) or implicitly the
// first time a waiter confirms receipt of one of its orders (see orders.service).
export async function getTablesForEstablishment(establishmentId: number) {
  const { rows } = await db.query(
    `SELECT t.*,
            CASE WHEN ts.id IS NOT NULL THEN ts.status::text ELSE 'idle' END AS session_status,
            ts.id AS active_session_id,
            u.first_name AS assigned_waiter_first_name,
            u.last_name AS assigned_waiter_last_name
     FROM tables t
     LEFT JOIN table_sessions ts ON ts.table_id = t.id AND ts.status != 'closed'
     LEFT JOIN users u ON u.id = t.assigned_waiter_id
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
            ts.id AS active_session_id,
            u.first_name AS assigned_waiter_first_name,
            u.last_name AS assigned_waiter_last_name
     FROM tables t
     LEFT JOIN table_sessions ts ON ts.table_id = t.id AND ts.status != 'closed'
     LEFT JOIN users u ON u.id = t.assigned_waiter_id
     WHERE t.id = $1 AND t.establishment_id = $2`,
    [tableId, establishmentId]
  );
  if (!rows[0]) throw new AppError('Table not found', 404);
  return rows[0];
}

// Manager assign/reassign/unassign (waiterId: null). Cascades only to orders
// still awaiting payment on the table's current session — nothing has been
// served yet, so there's no reason not to hand them to the new waiter. Orders
// already paid (pending/in_progress/delivered) keep whoever they're currently
// assigned to; only orders placed after this point default to the new waiter.
export async function assignWaiterToTable(
  tableId: number,
  establishmentId: number,
  waiterId: number | null
) {
  if (waiterId != null) {
    const { rows: staffRows } = await db.query(
      `SELECT id FROM users WHERE id = $1 AND establishment_id = $2 AND role IN ('waiter', 'admin') AND is_active = TRUE`,
      [waiterId, establishmentId]
    );
    if (!staffRows[0]) throw new AppError('Waiter not found', 404);
  }

  const { rows } = await db.query(
    `UPDATE tables SET assigned_waiter_id = $1 WHERE id = $2 AND establishment_id = $3 RETURNING *`,
    [waiterId, tableId, establishmentId]
  );
  if (!rows[0]) throw new AppError('Table not found', 404);

  const activeSession = await getActiveSession(tableId);
  if (activeSession) {
    await db.query(
      `UPDATE orders SET assigned_waiter_id = $1 WHERE table_session_id = $2 AND status = 'awaiting_payment'`,
      [waiterId, activeSession.id]
    );
  }

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

// Ties a table session to whichever device scanned it first: the caller gets
// an owner_token back and must present it on every later scan of the same
// table. A mismatched/missing token while a session is active means someone
// else is already using this table — occupied:true, no session handed out.
// A session with no owner yet (e.g. one that predates this column) is
// adopted by whichever device asks next, so nothing gets stuck.
export async function getOrCreateSession(
  tableId: number,
  establishmentId: number,
  token?: string
): Promise<{ session: Record<string, unknown> | null; ownerToken: string | null; occupied: boolean }> {
  const existing = await getActiveSession(tableId);
  if (existing) {
    if (!existing.owner_token) {
      const ownerToken = crypto.randomUUID();
      const { rows } = await db.query(
        `UPDATE table_sessions SET owner_token = $1 WHERE id = $2 RETURNING *`,
        [ownerToken, existing.id]
      );
      return { session: rows[0], ownerToken, occupied: false };
    }
    if (existing.owner_token === token) {
      return { session: existing, ownerToken: token as string, occupied: false };
    }
    return { session: null, ownerToken: null, occupied: true };
  }
  const ownerToken = crypto.randomUUID();
  const session = await openSession(tableId, establishmentId, ownerToken);
  return { session, ownerToken, occupied: false };
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

async function openSession(tableId: number, establishmentId: number, ownerToken: string) {
  await db.query(
    `UPDATE table_sessions SET status = 'closed', closed_at = NOW()
     WHERE table_id = $1 AND status != 'closed'`,
    [tableId]
  );
  const { rows } = await db.query(
    `INSERT INTO table_sessions (table_id, establishment_id, owner_token) VALUES ($1, $2, $3) RETURNING *`,
    [tableId, establishmentId, ownerToken]
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

// Orders left unpaid in a session the manager just force-closed — surfaced
// immediately so they don't have to separately check the unpaid-bills page.
export async function getUnpaidOrdersForSession(sessionId: number) {
  const { rows } = await db.query(
    `SELECT id, final_amount, confirmation_code, placed_at
     FROM orders WHERE table_session_id = $1 AND status = 'awaiting_payment'`,
    [sessionId]
  );
  return rows;
}

// Customer-initiated equivalent of closeSession — requires the session's
// owner_token instead of staff auth, so only the device that opened it (or a
// manager, via closeSession) can end it. Unlike the manager's close, this one
// is blocked while any order in the session is still unpaid — a customer
// can't walk away from a bill, only a manager can force that (and that path
// leaves the unpaid order trackable via getUnpaidOrders for later settlement).
export async function leaveSession(sessionId: number, token: string) {
  const { rows: unpaidRows } = await db.query(
    `SELECT 1 FROM orders WHERE table_session_id = $1 AND status = 'awaiting_payment' LIMIT 1`,
    [sessionId]
  );
  if (unpaidRows[0]) {
    throw new AppError('Please complete payment for all orders before leaving', 400);
  }

  const { rows } = await db.query(
    `UPDATE table_sessions SET status = 'closed', closed_at = NOW()
     WHERE id = $1 AND owner_token = $2 AND status != 'closed' RETURNING *`,
    [sessionId, token]
  );
  const session = rows[0];
  if (!session) throw new AppError('Invalid session or token', 404);
  return session;
}

import { v4 as uuidv4 } from 'uuid';
import db from '../../lib/db';
import { AppError } from '../../lib/errors';
import { sseManager } from '../../lib/sse';

export interface CartItem {
  menu_item_id: number;
  quantity: number;
  notes?: string;
}

function generateConfirmationCode(): string {
  return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
}

export async function createOrder(
  tableSessionId: number,
  establishmentId: number,
  cartItems: CartItem[]
) {
  if (cartItems.length === 0) throw new AppError('Order must have at least one item', 400);

  const itemIds = cartItems.map((c) => c.menu_item_id);
  const { rows: menuItems } = await db.query(
    `SELECT id, price, name, is_available FROM menu_items
     WHERE id = ANY($1) AND establishment_id = $2`,
    [itemIds, establishmentId]
  );

  const itemMap = new Map<number, { id: number; price: string; name: string; is_available: boolean }>(
    menuItems.map((m) => [m.id as number, m as { id: number; price: string; name: string; is_available: boolean }])
  );

  for (const ci of cartItems) {
    const item = itemMap.get(ci.menu_item_id);
    if (!item) throw new AppError(`Menu item ${ci.menu_item_id} not found`, 400);
    if (!item.is_available) throw new AppError(`${item.name} is currently unavailable`, 400);
  }

  let total = 0;
  for (const ci of cartItems) {
    const item = itemMap.get(ci.menu_item_id)!;
    total += parseFloat(item.price) * ci.quantity;
  }

  const confirmationCode = generateConfirmationCode();
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
         (table_session_id, establishment_id, status, total_amount, discount_amount, final_amount, confirmation_code)
       VALUES ($1, $2, 'awaiting_payment', $3, 0, $3, $4) RETURNING *`,
      [tableSessionId, establishmentId, total.toFixed(2), confirmationCode]
    );
    const order = orderRows[0];

    for (const ci of cartItems) {
      const item = itemMap.get(ci.menu_item_id)!;
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, ci.menu_item_id, ci.quantity, item.price, ci.notes || null]
      );
    }

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Called internally after payment is confirmed — makes order visible to waiters
export async function markOrderPaid(orderId: number, establishmentId: number) {
  const { rows } = await db.query(
    `UPDATE orders SET status = 'pending'
     WHERE id = $1 AND establishment_id = $2 AND status = 'awaiting_payment' RETURNING *`,
    [orderId, establishmentId]
  );
  const order = rows[0];
  if (!order) return null;

  const fullOrder = await getOrderWithItems(orderId);

  sseManager.broadcastToEstablishment(
    establishmentId,
    {
      type: 'order:new',
      establishmentId,
      payload: fullOrder,
      timestamp: new Date().toISOString(),
    },
    ['waiter', 'admin', 'super_manager']
  );

  sseManager.broadcastToSession(order.table_session_id as number, {
    type: 'payment:confirmed',
    establishmentId,
    payload: { order_id: orderId },
    timestamp: new Date().toISOString(),
  });

  return fullOrder;
}

export async function confirmOrderReceipt(orderId: number, establishmentId: number) {
  const { rows } = await db.query(
    `UPDATE orders SET status = 'in_progress', confirmed_at = NOW()
     WHERE id = $1 AND establishment_id = $2 AND status = 'pending' RETURNING *`,
    [orderId, establishmentId]
  );
  const order = rows[0];
  if (!order) throw new AppError('Order not found or cannot be confirmed', 404);

  sseManager.broadcastToSession(order.table_session_id as number, {
    type: 'order:status_changed',
    establishmentId,
    payload: { order_id: orderId, status: 'in_progress' },
    timestamp: new Date().toISOString(),
  });

  sseManager.broadcastToEstablishment(
    establishmentId,
    {
      type: 'order:status_changed',
      establishmentId,
      payload: { order_id: orderId, status: 'in_progress' },
      timestamp: new Date().toISOString(),
    },
    ['waiter', 'admin', 'super_manager']
  );

  return order;
}

export async function confirmOrderDelivery(confirmationCode: string, establishmentId: number, servedBy: number) {
  const { rows } = await db.query(
    `UPDATE orders SET status = 'delivered', delivered_at = NOW(), served_by = $3
     WHERE confirmation_code = $1 AND establishment_id = $2 AND status = 'in_progress' RETURNING *`,
    [confirmationCode, establishmentId]
  );
  const order = rows[0];
  if (!order) throw new AppError('Invalid code or order not in progress', 404);

  sseManager.broadcastToSession(order.table_session_id as number, {
    type: 'order:status_changed',
    establishmentId,
    payload: { order_id: order.id, status: 'delivered' },
    timestamp: new Date().toISOString(),
  });

  sseManager.broadcastToEstablishment(
    establishmentId,
    {
      type: 'order:status_changed',
      establishmentId,
      payload: { order_id: order.id, status: 'delivered' },
      timestamp: new Date().toISOString(),
    },
    ['waiter', 'admin', 'super_manager']
  );

  return order;
}

export async function getOrdersForEstablishment(establishmentId: number, status?: string) {
  const params: unknown[] = [establishmentId];
  let statusClause: string;

  if (status) {
    params.push(status);
    statusClause = `AND o.status = $${params.length}`;
  } else {
    statusClause = `AND o.status != 'awaiting_payment'`;
  }

  const { rows } = await db.query(
    `SELECT o.*,
       t.table_name,
       json_agg(json_build_object(
         'id', oi.id, 'menu_item_id', oi.menu_item_id, 'quantity', oi.quantity,
         'unit_price', oi.unit_price, 'notes', oi.notes, 'item_name', mi.name
       ) ORDER BY oi.id) AS items
     FROM orders o
     JOIN table_sessions ts ON ts.id = o.table_session_id
     JOIN tables t ON t.id = ts.table_id
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.establishment_id = $1 ${statusClause}
     GROUP BY o.id, t.table_name
     ORDER BY o.placed_at DESC`,
    params
  );
  return rows;
}

export async function getOrdersForSession(sessionId: number) {
  const { rows } = await db.query(
    `SELECT o.*,
       json_agg(json_build_object(
         'id', oi.id, 'menu_item_id', oi.menu_item_id, 'quantity', oi.quantity,
         'unit_price', oi.unit_price, 'notes', oi.notes, 'item_name', mi.name
       ) ORDER BY oi.id) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.table_session_id = $1 AND o.status != 'awaiting_payment'
     GROUP BY o.id
     ORDER BY o.placed_at DESC`,
    [sessionId]
  );
  return rows;
}

export async function getOrderWithItems(orderId: number) {
  const { rows } = await db.query(
    `SELECT o.*,
       t.table_name,
       json_agg(json_build_object(
         'id', oi.id, 'menu_item_id', oi.menu_item_id, 'quantity', oi.quantity,
         'unit_price', oi.unit_price, 'notes', oi.notes, 'item_name', mi.name
       ) ORDER BY oi.id) AS items
     FROM orders o
     JOIN table_sessions ts ON ts.id = o.table_session_id
     JOIN tables t ON t.id = ts.table_id
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.id = $1
     GROUP BY o.id, t.table_name`,
    [orderId]
  );
  return rows[0];
}

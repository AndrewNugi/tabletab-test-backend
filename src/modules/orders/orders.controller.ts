import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as ordersService from './orders.service';

const placeOrderSchema = z.object({
  table_session_id: z.number().int(),
  items: z
    .array(
      z.object({
        menu_item_id: z.number().int(),
        quantity: z.number().int().min(1),
        notes: z.string().optional(),
      })
    )
    .min(1, 'Order must contain at least one item'),
});

// Public: customer places order (creates in awaiting_payment state)
export async function placeOrder(req: Request, res: Response, next: NextFunction) {
  const establishmentId = parseInt(req.params.establishmentId);
  if (isNaN(establishmentId)) {
    res.status(400).json({ success: false, error: 'Invalid establishment ID' });
    return;
  }
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const order = await ordersService.createOrder(
      parsed.data.table_session_id,
      establishmentId,
      parsed.data.items
    );
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// Waiter/manager: list all visible orders (excludes awaiting_payment)
export async function listOrders(req: Request, res: Response, next: NextFunction) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  try {
    const orders = await ordersService.getOrdersForEstablishment(
      req.user!.establishmentId!,
      status
    );
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
}

// Waiter: acknowledge order receipt and start preparing
export async function confirmReceipt(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid order ID' });
    return;
  }
  try {
    const order = await ordersService.confirmOrderReceipt(id, req.user!.establishmentId!);
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// Waiter: scan/enter customer confirmation code to mark order delivered
export async function confirmDelivery(req: Request, res: Response, next: NextFunction) {
  const { confirmation_code } = req.body;
  if (!confirmation_code || typeof confirmation_code !== 'string') {
    res.status(400).json({ success: false, error: 'confirmation_code required' });
    return;
  }
  try {
    const order = await ordersService.confirmOrderDelivery(
      confirmation_code,
      req.user!.establishmentId!,
      req.user!.userId,
    );
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// Public: customer fetches their session's orders
export async function getSessionOrders(req: Request, res: Response, next: NextFunction) {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ success: false, error: 'Invalid session ID' });
    return;
  }
  try {
    const orders = await ordersService.getOrdersForSession(sessionId);
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
}

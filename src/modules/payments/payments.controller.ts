import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as paymentsService from './payments.service';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const initiateSchema = z.object({
  order_id: z.number().int(),
  phone:    z.string().min(9),
  amount:   z.number().positive(),
});

const credentialsSchema = z.object({
  consumer_key:       z.string().min(1),
  consumer_secret:    z.string().min(1),
  passkey:            z.string().min(1),
  business_shortcode: z.string().optional(),
});

// ─── Handlers ────────────────────────────────────────────────────────────────

// Public — customer triggers STK push after placing an order
export async function initiatePush(req: Request, res: Response, next: NextFunction) {
  const establishmentId = parseInt(req.params.establishmentId);
  if (isNaN(establishmentId)) {
    res.status(400).json({ success: false, error: 'Invalid establishment ID' });
    return;
  }

  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { order_id, phone, amount } = parsed.data;

  try {
    const result = await paymentsService.initiateStkPush(
      establishmentId,
      phone,
      amount,
      order_id
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// superadmin / super_manager — store encrypted Daraja credentials for an establishment
export async function setCredentials(req: Request, res: Response, next: NextFunction) {
  const establishmentId = parseInt(req.params.establishmentId);
  if (isNaN(establishmentId)) {
    res.status(400).json({ success: false, error: 'Invalid establishment ID' });
    return;
  }
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    await paymentsService.saveCredentials(
      establishmentId,
      parsed.data.consumer_key,
      parsed.data.consumer_secret,
      parsed.data.passkey,
      parsed.data.business_shortcode,
    );
    res.json({ success: true, message: 'Credentials saved and encrypted.' });
  } catch (err) {
    next(err);
  }
}

// Public — customer polls this as a fallback when the webhook hasn't arrived yet
export async function getStatus(req: Request, res: Response, next: NextFunction) {
  const establishmentId = parseInt(req.params.establishmentId);
  const orderId = parseInt(req.params.orderId);
  if (isNaN(establishmentId) || isNaN(orderId)) {
    res.status(400).json({ success: false, error: 'Invalid establishment or order ID' });
    return;
  }
  try {
    const result = await paymentsService.getPaymentStatus(establishmentId, orderId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// Public — called by Safaricom Daraja after the customer completes or cancels payment
export async function mpesaCallback(req: Request, res: Response, next: NextFunction) {
  const establishmentId = parseInt(req.params.establishmentId);
  if (isNaN(establishmentId)) {
    res.status(400).json({ success: false, error: 'Invalid establishment ID' });
    return;
  }

  try {
    const result = await paymentsService.handleCallback(establishmentId, req.body);
    // Safaricom expects a 200 with a specific shape to stop retries
    res.json({ ResultCode: 0, ResultDesc: 'Accepted', ...result });
  } catch (err) {
    next(err);
  }
}

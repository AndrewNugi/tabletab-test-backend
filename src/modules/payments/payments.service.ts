import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import axios from 'axios';
import db from '../../lib/db';
import { AppError } from '../../lib/errors';
import { markOrderPaid } from '../orders/orders.service';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DarajaCredentials {
  business_shortcode: string;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
  mpesa_env: string;
}

interface CallbackItem {
  Name: string;
  Value: unknown;
}

// ─── At-rest encryption (AES-256-GCM) ────────────────────────────────────────
// Stored format: base64(iv):base64(authTag):base64(ciphertext)
// The key is a 64-character hex string in CREDENTIALS_ENCRYPTION_KEY.

const ALGO = 'aes-256-gcm' as const;

function encryptionKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new AppError(
      'CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string in .env',
      500
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encryptCredential(plaintext: string): string {
  const key = encryptionKey();
  const iv  = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptCredential(stored: string): string {
  const key   = encryptionKey();
  const parts = stored.split(':');
  if (parts.length !== 3) throw new AppError('Corrupt credential value in database', 500);
  const iv        = Buffer.from(parts[0], 'base64');
  const tag       = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  const decipher  = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

// ─── Credential lookup ────────────────────────────────────────────────────────

async function getCredentials(establishmentId: number): Promise<DarajaCredentials> {
  const { rows } = await db.query(
    `SELECT business_shortcode, consumer_key, consumer_secret, passkey, mpesa_env
     FROM establishment_daraja_credentials
     WHERE establishment_id = $1`,
    [establishmentId]
  );
  if (!rows[0]) throw new AppError('M-Pesa not configured for this establishment', 500);

  const row = rows[0] as {
    business_shortcode: string;
    consumer_key:       string | null;
    consumer_secret:    string | null;
    passkey:            string | null;
    mpesa_env:          string;
  };

  if (!row.consumer_key || !row.consumer_secret || !row.passkey) {
    throw new AppError(
      'M-Pesa credentials not yet set for this establishment. ' +
      'Use PUT /api/payments/credentials/:establishmentId to configure them.',
      500
    );
  }

  return {
    business_shortcode: row.business_shortcode,
    consumer_key:       decryptCredential(row.consumer_key),
    consumer_secret:    decryptCredential(row.consumer_secret),
    passkey:            decryptCredential(row.passkey),
    mpesa_env:          row.mpesa_env,
  };
}

// ─── Credential write (admin use) ────────────────────────────────────────────

export async function saveCredentials(
  establishmentId: number,
  consumerKey: string,
  consumerSecret: string,
  passkey: string,
  businessShortcode?: string,
) {
  const sets: string[] = [
    'consumer_key = $1',
    'consumer_secret = $2',
    'passkey = $3',
  ];
  const vals: unknown[] = [
    encryptCredential(consumerKey),
    encryptCredential(consumerSecret),
    encryptCredential(passkey),
  ];
  if (businessShortcode) {
    sets.push(`business_shortcode = $${vals.length + 1}`);
    vals.push(businessShortcode);
  }
  vals.push(establishmentId);
  const { rows } = await db.query(
    `UPDATE establishment_daraja_credentials
     SET ${sets.join(', ')}
     WHERE establishment_id = $${vals.length}
     RETURNING establishment_id`,
    vals,
  );
  if (!rows[0]) throw new AppError('Establishment credentials record not found', 404);
}

// ─── Daraja helpers ───────────────────────────────────────────────────────────

function darajaBaseUrl(env: string): string {
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

// Daraja has no documented SLA on these endpoints; bound every outbound call
// so a slow/unresponsive upstream can't hold an Express request open forever.
const DARAJA_TIMEOUT_MS = 15_000;

async function getAccessToken(creds: DarajaCredentials): Promise<string> {
  const auth = Buffer.from(`${creds.consumer_key}:${creds.consumer_secret}`).toString('base64');
  const { data } = await axios.get(
    `${darajaBaseUrl(creds.mpesa_env)}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: DARAJA_TIMEOUT_MS }
  );
  return data.access_token as string;
}

function buildTimestamp(): string {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function buildPassword(shortcode: string, passkey: string, ts: string): string {
  return Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
}

// ─── Phone normalisation ──────────────────────────────────────────────────────
// Accepts: 254708374149 | 0708374149 | 708374149 | +254708374149

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if (digits.length === 9) return '254' + digits;
  throw new AppError(
    'Invalid phone number. Use 254XXXXXXXXX, 0XXXXXXXXX, or XXXXXXXXX format.',
    400
  );
}

// ─── STK Push ────────────────────────────────────────────────────────────────

export async function initiateStkPush(
  establishmentId: number,
  phone: string,
  amount: number,
  orderId: number
) {
  const normalizedPhone = normalizePhone(phone);
  const creds = await getCredentials(establishmentId);
  const token = await getAccessToken(creds);

  const callbackBase = process.env.MPESA_CALLBACK_BASE_URL;
  if (!callbackBase) throw new AppError('MPESA_CALLBACK_BASE_URL not set in environment', 500);

  // Each establishment gets its own callback URL so the callback knows who to credit
  const callbackUrl = `${callbackBase}/api/payments/mpesa/callback/${establishmentId}`;

  const ts       = buildTimestamp();
  const password = buildPassword(creds.business_shortcode, creds.passkey, ts);

  // Daraja hard-caps AccountReference at 12 chars and TransactionDesc at 13.
  const accountReference = `TT-${orderId}`.slice(0, 12);
  const transactionDesc  = `Order ${orderId}`.slice(0, 13);

  const { data } = await axios.post(
    `${darajaBaseUrl(creds.mpesa_env)}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: creds.business_shortcode,
      Password:          password,
      Timestamp:         ts,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(amount), // Daraja requires integer
      PartyA:            normalizedPhone,
      PartyB:            creds.business_shortcode,
      PhoneNumber:       normalizedPhone,
      CallBackURL:       callbackUrl,
      AccountReference:  accountReference,
      TransactionDesc:   transactionDesc,
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: DARAJA_TIMEOUT_MS }
  );

  if (data.ResponseCode !== '0' || !data.CheckoutRequestID) {
    throw new AppError(
      data.ResponseDescription || data.errorMessage || 'M-Pesa declined the STK push request',
      502
    );
  }

  // Resolve the session that owns this order
  const { rows: orderRows } = await db.query(
    `SELECT table_session_id FROM orders WHERE id = $1`,
    [orderId]
  );
  if (!orderRows[0]) throw new AppError('Order not found', 404);

  const { rows } = await db.query(
    `INSERT INTO payments
       (table_session_id, order_id, amount, method, phone_number, status, mpesa_checkout_request_id)
     VALUES ($1, $2, $3, 'mpesa', $4, 'pending', $5)
     RETURNING *`,
    [
      orderRows[0].table_session_id as number,
      orderId,
      amount,
      normalizedPhone,
      data.CheckoutRequestID as string,
    ]
  );

  return { payment: rows[0], daraja: data };
}

// ─── Result application (shared by the webhook and the query fallback) ───────
// Idempotent: only acts while the payment is still 'pending', so a duplicate
// webhook delivery or a query that races the webhook is a no-op.

async function applyStkResult(
  paymentId: number,
  orderId: number,
  establishmentId: number,
  resultCode: number,
  mpesaRef: string | null
): Promise<'confirmed' | 'failed' | 'unchanged'> {
  if (resultCode !== 0) {
    const { rows } = await db.query(
      `UPDATE payments SET status = 'failed' WHERE id = $1 AND status = 'pending' RETURNING id`,
      [paymentId]
    );
    return rows[0] ? 'failed' : 'unchanged';
  }

  const { rows } = await db.query(
    `UPDATE payments SET status = 'confirmed', mpesa_ref = $1
     WHERE id = $2 AND status = 'pending' RETURNING id`,
    [mpesaRef, paymentId]
  );
  if (!rows[0]) return 'unchanged';

  // Transitions order awaiting_payment → pending and broadcasts SSE to waiter screens
  await markOrderPaid(orderId, establishmentId);
  return 'confirmed';
}

// ─── Callback ─────────────────────────────────────────────────────────────────

export async function handleCallback(establishmentId: number, body: unknown) {
  const stkCallback = (
    (body as Record<string, unknown>)?.Body as Record<string, unknown>
  )?.stkCallback as Record<string, unknown> | undefined;

  if (!stkCallback) throw new AppError('Invalid callback payload', 400);

  const ResultCode        = stkCallback.ResultCode        as number;
  const CheckoutRequestID = stkCallback.CheckoutRequestID as string;
  const CallbackMetadata  = stkCallback.CallbackMetadata  as Record<string, unknown> | undefined;

  // Find the payment row, scoped to the establishment from the URL
  const { rows } = await db.query(
    `SELECT p.id, p.order_id
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.mpesa_checkout_request_id = $1
       AND o.establishment_id = $2`,
    [CheckoutRequestID, establishmentId]
  );

  if (!rows[0]) {
    // Unknown checkout ID — return 200 so Safaricom stops retrying
    return { received: true };
  }

  const paymentId = rows[0].id       as number;
  const orderId   = rows[0].order_id as number;

  // Pull the M-Pesa receipt number out of the metadata array (absent on failure)
  const items    = (CallbackMetadata?.Item as CallbackItem[]) ?? [];
  const mpesaRef = (items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value as string | undefined) ?? null;

  await applyStkResult(paymentId, orderId, establishmentId, ResultCode, mpesaRef);

  return { received: true };
}

// ─── Query fallback ───────────────────────────────────────────────────────────
// Webhook delivery isn't guaranteed (tunnel down, network blip, Safaricom
// retry exhaustion), so this lets us ask Daraja directly instead of leaving
// a payment — and its order — stuck in 'pending'/'awaiting_payment' forever.

export async function getPaymentStatus(establishmentId: number, orderId: number) {
  const { rows } = await db.query(
    `SELECT p.id, p.status, p.mpesa_checkout_request_id
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.order_id = $1 AND o.establishment_id = $2
     ORDER BY p.created_at DESC LIMIT 1`,
    [orderId, establishmentId]
  );
  const payment = rows[0] as { id: number; status: string; mpesa_checkout_request_id: string | null } | undefined;
  if (!payment) throw new AppError('No payment found for this order', 404);

  // Already resolved (by the webhook, or a previous query) — no need to call Daraja
  if (payment.status !== 'pending' || !payment.mpesa_checkout_request_id) {
    return { status: payment.status };
  }

  const creds = await getCredentials(establishmentId);
  const token = await getAccessToken(creds);
  const ts       = buildTimestamp();
  const password = buildPassword(creds.business_shortcode, creds.passkey, ts);

  let data: Record<string, unknown>;
  try {
    const res = await axios.post(
      `${darajaBaseUrl(creds.mpesa_env)}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: creds.business_shortcode,
        Password:          password,
        Timestamp:         ts,
        CheckoutRequestID: payment.mpesa_checkout_request_id,
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: DARAJA_TIMEOUT_MS }
    );
    data = res.data as Record<string, unknown>;
  } catch {
    // Daraja query itself can fail transiently — treat as "still pending", not an error
    return { status: 'pending' };
  }

  // "0" ResponseCode here only means the query was accepted; ResultCode carries the outcome.
  // Daraja returns 500.001.1001 ("being processed") via a non-2xx or a missing ResultCode
  // while the STK push is still awaiting the customer's PIN — leave it pending in that case.
  if (data.ResultCode === undefined || data.ResultCode === null) {
    return { status: 'pending' };
  }

  const resultCode = Number(data.ResultCode);
  // The query response carries no CallbackMetadata (that only arrives via the
  // real webhook), so a payment confirmed through this fallback path has no
  // mpesa_ref recorded — acceptable, since the receipt number is cosmetic here.
  const outcome = await applyStkResult(payment.id, orderId, establishmentId, resultCode, null);
  return { status: outcome === 'unchanged' ? payment.status : outcome };
}

// ─── TEST-ONLY: mock a successful Daraja callback ────────────────────────────
// For demos/POC walkthroughs where a real phone can't approve the sandbox STK
// push. Disabled unless ENABLE_MOCK_PAYMENTS=true — throws otherwise, so this
// is fully inert in any environment that hasn't explicitly opted in. Reuses
// applyStkResult so a mock success runs through the exact same downstream path
// (mark payment confirmed, markOrderPaid, SSE broadcast) as a real callback.
// Safe to delete: this function, its route, and the frontend button that calls it.

export async function mockConfirmPayment(establishmentId: number, orderId: number) {
  if (process.env.ENABLE_MOCK_PAYMENTS !== 'true') {
    throw new AppError('Mock payments are not enabled', 404);
  }

  const { rows } = await db.query(
    `SELECT p.id, p.status
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.order_id = $1 AND o.establishment_id = $2
     ORDER BY p.created_at DESC LIMIT 1`,
    [orderId, establishmentId]
  );
  const payment = rows[0] as { id: number; status: string } | undefined;
  if (!payment) throw new AppError('No payment found for this order', 404);

  const outcome = await applyStkResult(payment.id, orderId, establishmentId, 0, `MOCK-${Date.now()}`);
  return { status: outcome === 'unchanged' ? payment.status : outcome };
}

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { AppError } from '../../lib/errors';
import { saveCredentials } from '../payments/payments.service';
import { hashPassword } from '../auth/auth.service';
import db from '../../lib/db';

const router = Router();

// All routes: superadmin only
router.use(authenticate, requireRole('superadmin'));

// ── List establishments with stats + super_manager ────────────────────────────
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.name, e.address, e.phone, e.is_active, e.created_at,
              COUNT(DISTINCT t.id)::int AS table_count,
              COUNT(DISTINCT u.id)::int   AS staff_count,
              sm.id          AS super_manager_id,
              sm.first_name  AS super_manager_first_name,
              sm.last_name   AS super_manager_last_name,
              sm.email       AS super_manager_email,
              dc.business_shortcode,
              (dc.consumer_key IS NOT NULL) AS has_mpesa
       FROM establishments e
       LEFT JOIN tables t  ON t.establishment_id = e.id AND t.is_active = TRUE
       LEFT JOIN users u   ON u.establishment_id = e.id AND u.is_active = TRUE
                          AND u.role IN ('admin', 'waiter', 'super_manager')
       LEFT JOIN users sm  ON sm.establishment_id = e.id
                          AND sm.role = 'super_manager'
                          AND sm.is_active = TRUE
       LEFT JOIN establishment_daraja_credentials dc ON dc.establishment_id = e.id
       GROUP BY e.id, sm.id, sm.first_name, sm.last_name, sm.email,
                dc.business_shortcode, dc.consumer_key
       ORDER BY e.id`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ── Create establishment ──────────────────────────────────────────────────────
const createEstSchema = z.object({
  name:               z.string().min(1),
  address:            z.string().optional(),
  phone:              z.string().optional(),
  business_shortcode: z.string().optional(),
  consumer_key:       z.string().optional(),
  consumer_secret:    z.string().optional(),
  passkey:            z.string().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createEstSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO establishments (organisation_id, name, address, phone)
       VALUES (1, $1, $2, $3) RETURNING *`,
      [parsed.data.name, parsed.data.address || null, parsed.data.phone || null]
    );
    const est = rows[0];
    const shortcode = parsed.data.business_shortcode || '174379';
    await db.query(
      `INSERT INTO establishment_daraja_credentials (establishment_id, business_shortcode)
       VALUES ($1, $2)
       ON CONFLICT (establishment_id) DO UPDATE SET business_shortcode = EXCLUDED.business_shortcode`,
      [est.id, shortcode]
    );
    const { consumer_key, consumer_secret, passkey } = parsed.data;
    if (consumer_key && consumer_secret && passkey) {
      await saveCredentials(est.id, consumer_key, consumer_secret, passkey);
    }
    res.status(201).json({ success: true, data: est });
  } catch (err) {
    next(err);
  }
});

// ── Assign / replace super_manager for an establishment ───────────────────────
const createSmSchema = z.object({
  first_name: z.string().min(1),
  last_name:  z.string().min(1),
  email:      z.string().email(),
  password:   z.string().min(8),
});

router.post('/:id/super-manager', async (req: Request, res: Response, next: NextFunction) => {
  const estId = parseInt(req.params.id);
  if (isNaN(estId)) {
    res.status(400).json({ success: false, error: 'Invalid establishment ID' });
    return;
  }
  const parsed = createSmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const { rows: estRows } = await db.query(
      `SELECT id, organisation_id FROM establishments WHERE id = $1`,
      [estId]
    );
    if (!estRows[0]) throw new AppError('Establishment not found', 404);

    // Deactivate any existing super_manager for this establishment
    await db.query(
      `UPDATE users SET is_active = FALSE
       WHERE establishment_id = $1 AND role = 'super_manager'`,
      [estId]
    );

    const password_hash = await hashPassword(parsed.data.password);
    const { rows } = await db.query(
      `INSERT INTO users
         (establishment_id, organisation_id, role, first_name, last_name, email, password_hash)
       VALUES ($1, $2, 'super_manager', $3, $4, $5, $6)
       RETURNING id, first_name, last_name, email, role`,
      [
        estId,
        estRows[0].organisation_id as number,
        parsed.data.first_name,
        parsed.data.last_name,
        parsed.data.email.toLowerCase(),
        password_hash,
      ]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err instanceof Error && err.message.includes('duplicate')) {
      res.status(400).json({ success: false, error: 'Email already in use' });
      return;
    }
    next(err);
  }
});

export default router;

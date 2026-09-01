import { Router, NextFunction, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireEstablishment } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as staffService from './staff.service';

const router = Router();

router.use(authenticate, requireEstablishment);

// ── My own profile / shift (any authenticated staff member) ──────────────────
router.get(
  '/me/stats',
  requireRole('super_manager', 'admin', 'waiter'),
  asyncHandler(async (req, res) => {
    const stats = await staffService.getMyStats(req.user!.userId);
    if (!stats) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    res.json({ success: true, data: stats });
  })
);

router.patch(
  '/me/shift',
  requireRole('waiter', 'admin', 'super_manager'),
  asyncHandler(async (req, res) => {
    const { on_shift } = req.body;
    if (typeof on_shift !== 'boolean') {
      res.status(400).json({ success: false, error: 'on_shift (boolean) required' });
      return;
    }
    const result = await staffService.toggleShift(req.user!.userId, req.user!.establishmentId!, on_shift);
    if (!result) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    res.json({ success: true, data: result });
  })
);

// ── List staff ───────────────────────────────────────────────────────────────
router.get(
  '/',
  requireRole('super_manager', 'admin', 'superadmin'),
  asyncHandler(async (req, res) => {
    const staff = await staffService.listStaff(req.user!.establishmentId!);
    res.json({ success: true, data: staff });
  })
);

const createSchema = z.object({
  first_name: z.string().min(1),
  last_name:  z.string().min(1),
  email:      z.string().email(),
  password:   z.string().min(8),
  role:       z.enum(['admin', 'waiter']),
});

router.post(
  '/',
  requireRole('super_manager', 'superadmin'),
  asyncHandler(async (req, res, next: NextFunction) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }
    try {
      const user = req.user!;
      const staff = await staffService.createStaff(user.establishmentId!, user.organisationId!, parsed.data);
      res.status(201).json({ success: true, data: staff });
    } catch (err) {
      if (err instanceof Error && err.message.includes('duplicate')) {
        res.status(400).json({ success: false, error: 'Email already exists' });
        return;
      }
      next(err);
    }
  })
);

router.patch(
  '/:id/status',
  requireRole('super_manager', 'admin', 'superadmin'),
  asyncHandler(async (req, res) => {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      res.status(400).json({ success: false, error: 'is_active required' });
      return;
    }
    const staff = await staffService.toggleStaffStatus(
      parseInt(req.params.id),
      req.user!.establishmentId!,
      is_active,
    );
    if (!staff) { res.status(404).json({ success: false, error: 'Staff not found' }); return; }
    res.json({ success: true, data: staff });
  })
);

export default router;

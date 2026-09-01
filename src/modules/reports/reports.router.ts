import { Router } from 'express';
import { authenticate, requireRole, requireEstablishment } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import db from '../../lib/db';

const router = Router();
router.use(authenticate, requireRole('super_manager', 'admin', 'superadmin'), requireEstablishment);

router.get('/summary', asyncHandler(async (req, res) => {
  const estId = req.user!.establishmentId!;
  const period = (req.query.period as string) || 'day';
  const interval = period === 'month' ? '30 days' : period === 'week' ? '7 days' : '1 day';

  const { rows: revenue } = await db.query(
    `SELECT COALESCE(SUM(o.final_amount), 0) as total_revenue, COUNT(o.id) as total_orders
     FROM orders o
     JOIN payments p ON p.order_id = o.id
     WHERE o.establishment_id = $1 AND p.status = 'confirmed'
     AND o.placed_at >= NOW() - INTERVAL '${interval}'`,
    [estId]
  );

  const { rows: topItems } = await db.query(
    `SELECT mi.name, SUM(oi.quantity) as total_quantity
     FROM order_items oi
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.establishment_id = $1 AND o.status = 'delivered'
     AND o.placed_at >= NOW() - INTERVAL '${interval}'
     GROUP BY mi.name ORDER BY total_quantity DESC LIMIT 10`,
    [estId]
  );

  const { rows: activeTables } = await db.query(
    `SELECT COUNT(*) as count FROM table_sessions WHERE establishment_id = $1 AND status = 'active'`,
    [estId]
  );

  res.json({
    success: true,
    data: {
      revenue: revenue[0],
      top_items: topItems,
      active_tables: activeTables[0].count,
    },
  });
}));

export default router;

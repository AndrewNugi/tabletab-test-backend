import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole, requireEstablishment } from '../../middleware/auth';
import * as ctrl from './orders.controller';

const router = Router();

const orderRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many orders placed, please wait' },
});

// Public customer endpoints
router.post('/establishment/:establishmentId/place', orderRateLimit, ctrl.placeOrder);
router.get('/session/:sessionId', ctrl.getSessionOrders);

// Waiter/Manager endpoints
router.use(authenticate, requireEstablishment);
router.get('/', ctrl.listOrders);
router.post('/:id/confirm-receipt', requireRole('waiter', 'super_manager', 'admin'), ctrl.confirmReceipt);
router.post('/confirm-delivery', requireRole('waiter', 'super_manager', 'admin'), ctrl.confirmDelivery);

export default router;

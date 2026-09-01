import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole, requireEstablishment } from '../../middleware/auth';
import * as ctrl from './payments.controller';

const router = Router();

// Each poll may trigger a live Daraja query, so this is tighter than a plain read endpoint
const statusRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many status checks, please wait' },
});

// superadmin / super_manager — set encrypted Daraja credentials for an establishment
router.put(
  '/credentials/:establishmentId',
  authenticate,
  requireRole('superadmin', 'super_manager'),
  requireEstablishment,
  ctrl.setCredentials
);

// Customer initiates STK push for an order (public)
router.post('/mpesa/initiate/:establishmentId', ctrl.initiatePush);

// Customer polls this as a fallback if the webhook hasn't confirmed yet (public)
router.get('/mpesa/status/:establishmentId/:orderId', statusRateLimit, ctrl.getStatus);

// TEST-ONLY: simulates a successful Daraja callback without a real STK push.
// Inert unless ENABLE_MOCK_PAYMENTS=true — safe to delete this line for production.
router.post('/mpesa/mock-confirm/:establishmentId', statusRateLimit, ctrl.mockConfirmPush);

// Safaricom Daraja posts the payment result here (public — called by Safaricom)
router.post('/mpesa/callback/:establishmentId', ctrl.mpesaCallback);

export default router;

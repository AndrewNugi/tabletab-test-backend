import { Router } from 'express';
import { authenticate, requireRole, requireEstablishment } from '../../middleware/auth';
import * as ctrl from './tables.controller';

const router = Router();

// Public — customer scans QR code
router.get('/init/:tableId', ctrl.initCustomerSession);

// All management routes require auth
router.use(authenticate);

// Both roles can list / view tables
router.get('/', requireEstablishment, ctrl.listTables);
router.get('/:id', requireEstablishment, ctrl.getTable);

// Both roles can update a table name and close sessions
router.patch('/:id', requireRole('super_manager', 'admin', 'superadmin'), requireEstablishment, ctrl.updateTable);
router.post('/sessions/:sessionId/close', requireRole('super_manager', 'admin', 'superadmin'), requireEstablishment, ctrl.closeTableSession);

// Only super_manager (and superadmin) can create tables or regenerate QR codes
router.post('/', requireRole('super_manager', 'superadmin'), requireEstablishment, ctrl.createTable);
router.post('/:id/regenerate-qr', requireRole('super_manager', 'superadmin'), requireEstablishment, ctrl.regenerateQR);

export default router;

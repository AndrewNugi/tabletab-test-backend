import { Router } from 'express';
import { authenticate, requireRole, requireEstablishment } from '../../middleware/auth';
import * as ctrl from './menu.controller';

const router = Router();

// Public — customer fetches the active menu
router.get('/establishment/:establishmentId', ctrl.getMenu);

// Manager/admin routes
const mgr = [authenticate, requireRole('super_manager', 'admin', 'superadmin'), requireEstablishment];

router.get('/categories', ...mgr, ctrl.listCategories);
router.post('/categories', ...mgr, ctrl.createCategory);
router.patch('/categories/:id', ...mgr, ctrl.updateCategory);
router.delete('/categories/:id', ...mgr, ctrl.deleteCategory);

router.post('/categories/:categoryId/sub-categories', ...mgr, ctrl.createSubCategory);
router.patch('/categories/:categoryId/sub-categories/:id', ...mgr, ctrl.updateSubCategory);
router.delete('/categories/:categoryId/sub-categories/:id', ...mgr, ctrl.deleteSubCategory);

router.get('/items', ...mgr, ctrl.listMenuItems);
router.post('/items', ...mgr, ctrl.createMenuItem);
router.patch('/items/:id', ...mgr, ctrl.updateMenuItem);
router.delete('/items/:id', ...mgr, ctrl.deleteMenuItem);
router.patch('/items/:id/availability', ...mgr, ctrl.setItemAvailability);

router.get('/discounts', ...mgr, ctrl.listDiscounts);
router.post('/discounts', ...mgr, ctrl.createDiscount);
router.delete('/discounts/:id', ...mgr, ctrl.removeDiscount);

export default router;

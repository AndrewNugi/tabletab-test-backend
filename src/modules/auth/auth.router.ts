import { Router } from 'express';
import { login, logout, sseToken, me, changePassword } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.post('/sse-token', authenticate, sseToken);
router.get('/me', authenticate, me);
router.put('/change-password', authenticate, changePassword);

export default router;

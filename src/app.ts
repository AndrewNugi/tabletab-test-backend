import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRouter from './modules/auth/auth.router';
import tablesRouter from './modules/tables/tables.router';
import menuRouter from './modules/menu/menu.router';
import ordersRouter from './modules/orders/orders.router';
import paymentsRouter from './modules/payments/payments.router';
import staffRouter from './modules/staff/staff.router';
import reportsRouter from './modules/reports/reports.router';
import sseRouter from './modules/sse/sse.router';
import establishmentsRouter from './modules/establishments/establishments.router';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

// Brute-force protection on login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many login attempts, try again later' },
  skipSuccessfulRequests: true,
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', loginLimiter, authRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/staff', staffRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/sse', sseRouter);
app.use('/api/establishments', establishmentsRouter);

app.use(errorHandler);

// Vercel invokes the exported app directly as a request handler and manages
// its own listening socket — calling app.listen() there is unnecessary (and
// on Fluid Compute's reused instances would try to rebind on every cold start).
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`TableTab backend running on http://localhost:${PORT}`);
  });
}

export default app;

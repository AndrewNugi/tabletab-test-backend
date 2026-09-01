import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sseManager } from '../../lib/sse';
import jwt from 'jsonwebtoken';
import { AuthPayload } from '../../middleware/auth';

type SseTokenPayload = AuthPayload & { type?: string };

const router = Router();

// Staff SSE stream — authenticated via short-lived SSE token in query param
// Token is issued by POST /api/auth/sse-token (60s TTL) so it expires quickly in logs
router.get('/staff', (req: Request, res: Response, next: NextFunction) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(401).end();
    return;
  }

  let payload: SseTokenPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as SseTokenPayload;
  } catch (err) {
    next(err);
    return;
  }

  if (payload.type !== 'sse') {
    res.status(401).end();
    return;
  }

  if (!payload.establishmentId) {
    res.status(403).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = uuidv4();
  sseManager.addClient(clientId, {
    res,
    establishmentId: payload.establishmentId,
    role: payload.role,
  });

  res.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeClient(clientId);
  });
});

// Customer SSE stream — identified by sessionId (no auth, public table session)
router.get('/customer/:sessionId', (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.sessionId);
  const establishmentId = parseInt(req.query.eid as string);

  if (!sessionId || !establishmentId) {
    res.status(400).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = uuidv4();
  sseManager.addClient(clientId, {
    res,
    establishmentId,
    role: 'customer',
    sessionId,
  });

  res.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeClient(clientId);
  });
});

export default router;

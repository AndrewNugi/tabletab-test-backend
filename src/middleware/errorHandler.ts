import { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { AppError } from '../lib/errors';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, error: err.message });
    return;
  }

  if (err instanceof TokenExpiredError) {
    res.status(401).json({ success: false, error: 'Token expired' });
    return;
  }

  if (err instanceof JsonWebTokenError) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
}

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { loginUser, issueSseToken, changePassword as changePasswordService } from './auth.service';
import { loginSchema } from './auth.validation';
import { COOKIE_NAME, cookieOptions } from '../../middleware/auth';

const ACCESS_MAX_AGE = 6 * 60 * 60 * 1000;

export async function login(req: Request, res: Response, next: NextFunction) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await loginUser(parsed.data.email, parsed.data.password);
    res.cookie(COOKIE_NAME, result.token, { ...cookieOptions, maxAge: ACCESS_MAX_AGE });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ success: true, message: 'Logged out' });
}

export function sseToken(req: Request, res: Response) {
  const token = issueSseToken(req.user!);
  res.json({ success: true, data: { token } });
}

export function me(req: Request, res: Response) {
  res.json({ success: true, data: req.user });
}

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
});

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const newToken = await changePasswordService(
      req.user!.userId,
      parsed.data.current_password,
      parsed.data.new_password,
    );
    res.cookie(COOKIE_NAME, newToken, { ...cookieOptions, maxAge: ACCESS_MAX_AGE });
    res.json({ success: true, data: { token: newToken } });
  } catch (err) {
    next(err);
  }
}

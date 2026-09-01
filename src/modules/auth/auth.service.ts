import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../../lib/db';
import { AppError } from '../../lib/errors';
import { AuthPayload } from '../../middleware/auth';

const ACCESS_TTL_SEC = 6 * 60 * 60;

export async function loginUser(email: string, password: string) {
  const { rows } = await db.query<{
    id: number;
    email: string;
    password_hash: string;
    role: string;
    first_name: string;
    last_name: string;
    establishment_id: number | null;
    organisation_id: number | null;
    is_active: boolean;
    must_change_password: boolean;
  }>(
    `SELECT id, email, password_hash, role, first_name, last_name,
            establishment_id, organisation_id, is_active, must_change_password
     FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  const user = rows[0];
  if (!user) throw new AppError('Invalid credentials', 401);
  if (!user.is_active) throw new AppError('Account is deactivated', 403);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError('Invalid credentials', 401);

  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    role: user.role as AuthPayload['role'],
    establishmentId: user.establishment_id,
    organisationId: user.organisation_id,
    mustChangePassword: user.must_change_password,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ACCESS_TTL_SEC });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      establishment_id: user.establishment_id,
      must_change_password: user.must_change_password,
    },
  };
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<string> {
  const { rows } = await db.query<{
    password_hash: string;
    role: string;
    establishment_id: number | null;
    organisation_id: number | null;
    email: string;
  }>(
    `SELECT password_hash, role, establishment_id, organisation_id, email
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) throw new AppError('User not found', 404);
  const user = rows[0];

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new AppError('Current password is incorrect', 400);

  const newHash = await hashPassword(newPassword);
  await db.query(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
    [newHash, userId]
  );

  const payload: AuthPayload = {
    userId,
    email: user.email,
    role: user.role as AuthPayload['role'],
    establishmentId: user.establishment_id,
    organisationId: user.organisation_id,
    mustChangePassword: false,
  };
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ACCESS_TTL_SEC });
}

export function issueSseToken(payload: AuthPayload): string {
  const { iat, exp, ...clean } = payload as AuthPayload & { iat?: number; exp?: number };
  return jwt.sign({ ...clean, type: 'sse' }, process.env.JWT_SECRET!, { expiresIn: 60 });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

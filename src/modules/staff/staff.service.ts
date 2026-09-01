import db from '../../lib/db';
import { hashPassword } from '../auth/auth.service';

export async function listStaff(establishmentId: number) {
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, email, role, is_active, is_on_shift, created_at
     FROM users WHERE establishment_id = $1 ORDER BY role, created_at DESC`,
    [establishmentId]
  );
  return rows;
}

export async function createStaff(establishmentId: number, organisationId: number, data: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: 'admin' | 'waiter';
}) {
  const password_hash = await hashPassword(data.password);
  const { rows } = await db.query(
    `INSERT INTO users
       (establishment_id, organisation_id, role, first_name, last_name, email, password_hash, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING id, first_name, last_name, email, role, is_active, created_at`,
    [establishmentId, organisationId, data.role, data.first_name, data.last_name, data.email.toLowerCase(), password_hash]
  );
  return rows[0];
}

export async function toggleStaffStatus(userId: number, establishmentId: number, isActive: boolean) {
  const { rows } = await db.query(
    `UPDATE users SET is_active = $1
     WHERE id = $2 AND establishment_id = $3
     RETURNING id, email, is_active, is_on_shift`,
    [isActive, userId, establishmentId]
  );
  return rows[0];
}

export async function toggleShift(userId: number, establishmentId: number, onShift: boolean) {
  const { rows } = await db.query(
    `UPDATE users SET is_on_shift = $1
     WHERE id = $2 AND establishment_id = $3
     RETURNING id, email, is_on_shift`,
    [onShift, userId, establishmentId]
  );
  return rows[0];
}

export async function getMyStats(userId: number) {
  const { rows: [user] } = await db.query(
    `SELECT id, first_name, last_name, email, role, is_on_shift, establishment_id
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) return null;

  const { rows: [stats] } = await db.query(
    `SELECT
       COUNT(*)::int                             AS orders_served,
       COALESCE(SUM(o.final_amount), 0)::numeric AS total_sales
     FROM orders o
     WHERE o.served_by = $1 AND o.status = 'delivered'`,
    [userId]
  );

  return {
    id:           user.id,
    first_name:   user.first_name,
    last_name:    user.last_name,
    email:        user.email,
    role:         user.role,
    is_on_shift:  user.is_on_shift,
    orders_served: stats.orders_served,
    total_sales:   stats.total_sales,
  };
}

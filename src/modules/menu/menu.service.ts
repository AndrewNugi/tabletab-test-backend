import db from '../../lib/db';
import { AppError } from '../../lib/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

type CreateCategoryData     = { name: string; description?: string; sort_order?: number };
type UpdateCategoryData     = { name?: string; description?: string | null; sort_order?: number; is_active?: boolean };
type CreateSubCategoryData  = { name: string; sort_order?: number };
type UpdateSubCategoryData  = { name?: string; sort_order?: number; is_active?: boolean };

type CreateMenuItemData = {
  sub_category_id: number;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
};
type UpdateMenuItemData = {
  name?: string;
  description?: string | null;
  price?: number;
  image_url?: string | null;
  sub_category_id?: number | null;
  is_available?: boolean;
  is_active?: boolean;
};

type CreateDiscountData = {
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  applies_to: 'menu' | 'category' | 'sub_category' | 'item';
  target_id?: number;
  starts_at: string;
  ends_at: string;
};

// ─── Public ──────────────────────────────────────────────────────────────────

export async function getMenuForEstablishment(establishmentId: number) {
  const { rows: categories } = await db.query(
    `SELECT * FROM categories WHERE establishment_id = $1 AND is_active = TRUE ORDER BY sort_order, name`,
    [establishmentId]
  );
  const { rows: subCategories } = await db.query(
    `SELECT sc.* FROM sub_categories sc
     JOIN categories c ON c.id = sc.category_id
     WHERE c.establishment_id = $1 AND sc.is_active = TRUE
     ORDER BY sc.sort_order, sc.name`,
    [establishmentId]
  );
  const { rows: items } = await db.query(
    `SELECT * FROM menu_items WHERE establishment_id = $1 AND is_active = TRUE ORDER BY name`,
    [establishmentId]
  );

  const subCatMap = new Map<number, typeof subCategories>();
  for (const sc of subCategories) {
    const catId = sc.category_id as number;
    if (!subCatMap.has(catId)) subCatMap.set(catId, []);
    subCatMap.get(catId)!.push(sc);
  }

  const itemsBySubCat = new Map<number, typeof items>();
  for (const item of items) {
    if (item.sub_category_id) {
      const subCatId = item.sub_category_id as number;
      if (!itemsBySubCat.has(subCatId)) itemsBySubCat.set(subCatId, []);
      itemsBySubCat.get(subCatId)!.push(item);
    }
  }

  return categories.map((cat) => ({
    ...cat,
    sub_categories: (subCatMap.get(cat.id as number) || []).map((sc) => ({
      ...sc,
      items: itemsBySubCat.get(sc.id as number) || [],
    })),
  }));
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getCategories(establishmentId: number) {
  const { rows } = await db.query(
    `SELECT * FROM categories WHERE establishment_id = $1 ORDER BY sort_order, name`,
    [establishmentId]
  );
  return rows;
}

export async function createCategory(establishmentId: number, data: CreateCategoryData) {
  const { rows } = await db.query(
    `INSERT INTO categories (establishment_id, name, description, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [establishmentId, data.name, data.description || null, data.sort_order ?? 0]
  );
  return rows[0];
}

export async function updateCategory(id: number, establishmentId: number, data: UpdateCategoryData) {
  const allowed = ['name', 'description', 'sort_order', 'is_active'] as const;
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const col of allowed) {
    if (col in data && data[col] !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(data[col]);
    }
  }
  if (fields.length === 0) throw new AppError('No fields to update', 400);

  const { rows } = await db.query(
    `UPDATE categories SET ${fields.join(', ')}
     WHERE id = $${i} AND establishment_id = $${i + 1} RETURNING *`,
    [...values, id, establishmentId]
  );
  if (!rows[0]) throw new AppError('Category not found', 404);
  return rows[0];
}

export async function deleteCategory(id: number, establishmentId: number) {
  const { rows } = await db.query(
    `UPDATE categories SET is_active = FALSE
     WHERE id = $1 AND establishment_id = $2 RETURNING *`,
    [id, establishmentId]
  );
  if (!rows[0]) throw new AppError('Category not found', 404);
  return rows[0];
}

// ─── Sub-categories ───────────────────────────────────────────────────────────

async function verifyCategoryOwnership(categoryId: number, establishmentId: number) {
  const { rows } = await db.query(
    `SELECT id FROM categories WHERE id = $1 AND establishment_id = $2`,
    [categoryId, establishmentId]
  );
  if (!rows[0]) throw new AppError('Category not found', 404);
}

export async function createSubCategory(
  categoryId: number,
  establishmentId: number,
  data: CreateSubCategoryData
) {
  await verifyCategoryOwnership(categoryId, establishmentId);
  const { rows } = await db.query(
    `INSERT INTO sub_categories (category_id, name, sort_order) VALUES ($1, $2, $3) RETURNING *`,
    [categoryId, data.name, data.sort_order ?? 0]
  );
  return rows[0];
}

export async function updateSubCategory(
  id: number,
  categoryId: number,
  establishmentId: number,
  data: UpdateSubCategoryData
) {
  await verifyCategoryOwnership(categoryId, establishmentId);

  const allowed = ['name', 'sort_order', 'is_active'] as const;
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const col of allowed) {
    if (col in data && data[col] !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(data[col]);
    }
  }
  if (fields.length === 0) throw new AppError('No fields to update', 400);

  const { rows } = await db.query(
    `UPDATE sub_categories SET ${fields.join(', ')}
     WHERE id = $${i} AND category_id = $${i + 1} RETURNING *`,
    [...values, id, categoryId]
  );
  if (!rows[0]) throw new AppError('Sub-category not found', 404);
  return rows[0];
}

export async function deleteSubCategory(id: number, categoryId: number, establishmentId: number) {
  await verifyCategoryOwnership(categoryId, establishmentId);
  const { rows } = await db.query(
    `UPDATE sub_categories SET is_active = FALSE WHERE id = $1 AND category_id = $2 RETURNING *`,
    [id, categoryId]
  );
  if (!rows[0]) throw new AppError('Sub-category not found', 404);
  return rows[0];
}

// ─── Menu items ───────────────────────────────────────────────────────────────

export async function getMenuItems(establishmentId: number) {
  const { rows } = await db.query(
    `SELECT mi.*, c.name AS category_name, sc.name AS sub_category_name
     FROM menu_items mi
     JOIN categories c ON c.id = mi.category_id
     LEFT JOIN sub_categories sc ON sc.id = mi.sub_category_id
     WHERE mi.establishment_id = $1
     ORDER BY c.sort_order, sc.sort_order, mi.name`,
    [establishmentId]
  );
  return rows;
}

export async function createMenuItem(establishmentId: number, data: CreateMenuItemData) {
  const { rows: scRows } = await db.query(
    `SELECT sc.id, sc.category_id FROM sub_categories sc
     JOIN categories c ON c.id = sc.category_id
     WHERE sc.id = $1 AND c.establishment_id = $2 AND sc.is_active = TRUE AND c.is_active = TRUE`,
    [data.sub_category_id, establishmentId]
  );
  if (!scRows[0]) throw new AppError('Sub-category not found', 404);

  const { rows } = await db.query(
    `INSERT INTO menu_items
       (establishment_id, category_id, sub_category_id, name, description, price, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      establishmentId,
      scRows[0].category_id as number,
      data.sub_category_id,
      data.name,
      data.description || null,
      data.price,
      data.image_url || null,
    ]
  );
  return rows[0];
}

export async function updateMenuItem(id: number, establishmentId: number, data: UpdateMenuItemData) {
  const allowed = [
    'name', 'description', 'price', 'image_url',
    'sub_category_id', 'is_available', 'is_active',
  ] as const;
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const col of allowed) {
    if (col in data && data[col] !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(data[col]);
    }
  }
  if (fields.length === 0) throw new AppError('No fields to update', 400);

  const { rows } = await db.query(
    `UPDATE menu_items SET ${fields.join(', ')}
     WHERE id = $${i} AND establishment_id = $${i + 1} RETURNING *`,
    [...values, id, establishmentId]
  );
  if (!rows[0]) throw new AppError('Item not found', 404);
  return rows[0];
}

export async function deleteMenuItem(id: number, establishmentId: number) {
  const { rows } = await db.query(
    `UPDATE menu_items SET is_active = FALSE
     WHERE id = $1 AND establishment_id = $2 RETURNING *`,
    [id, establishmentId]
  );
  if (!rows[0]) throw new AppError('Item not found', 404);
  return rows[0];
}

export async function setItemAvailability(id: number, establishmentId: number, isAvailable: boolean) {
  const { rows } = await db.query(
    `UPDATE menu_items SET is_available = $1
     WHERE id = $2 AND establishment_id = $3 RETURNING *`,
    [isAvailable, id, establishmentId]
  );
  if (!rows[0]) throw new AppError('Item not found', 404);
  return rows[0];
}

// ─── Discounts ────────────────────────────────────────────────────────────────

export async function getDiscounts(establishmentId: number) {
  const { rows } = await db.query(
    `SELECT * FROM discounts WHERE establishment_id = $1 ORDER BY starts_at DESC`,
    [establishmentId]
  );
  return rows;
}

export async function createDiscount(establishmentId: number, data: CreateDiscountData) {
  const { rows } = await db.query(
    `INSERT INTO discounts (establishment_id, name, type, value, applies_to, target_id, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      establishmentId,
      data.name,
      data.type,
      data.value,
      data.applies_to,
      data.target_id ?? null,
      data.starts_at,
      data.ends_at,
    ]
  );
  return rows[0];
}

export async function deactivateDiscount(id: number, establishmentId: number) {
  const { rows } = await db.query(
    `UPDATE discounts SET is_active = FALSE WHERE id = $1 AND establishment_id = $2 RETURNING *`,
    [id, establishmentId]
  );
  if (!rows[0]) throw new AppError('Discount not found', 404);
  return rows[0];
}

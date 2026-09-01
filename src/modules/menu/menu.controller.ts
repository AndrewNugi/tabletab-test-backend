import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as menuService from './menu.service';
import { sseManager } from '../../lib/sse';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sort_order: z.number().int().optional(),
});

const updateCategorySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'At least one field required',
  });

const subCategorySchema = z.object({
  name: z.string().min(1),
  sort_order: z.number().int().optional(),
});

const updateSubCategorySchema = z
  .object({
    name: z.string().min(1).optional(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'At least one field required',
  });

const menuItemSchema = z.object({
  sub_category_id: z.number().int(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  image_url: z.string().url().optional(),
});

const updateMenuItemSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    price: z.number().positive().optional(),
    image_url: z.string().url().nullable().optional(),
    sub_category_id: z.number().int().nullable().optional(),
    is_available: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'At least one field required',
  });

const discountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().positive(),
  applies_to: z.enum(['menu', 'category', 'sub_category', 'item']),
  target_id: z.number().int().optional(),
  starts_at: z.string().datetime({ offset: true }).or(z.string().min(1)),
  ends_at: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

// ─── Public ───────────────────────────────────────────────────────────────────

export async function getMenu(req: Request, res: Response, next: NextFunction) {
  const establishmentId = parseInt(req.params.establishmentId);
  if (isNaN(establishmentId)) {
    res.status(400).json({ success: false, error: 'Invalid establishment ID' });
    return;
  }
  try {
    const menu = await menuService.getMenuForEstablishment(establishmentId);
    res.json({ success: true, data: menu });
  } catch (err) {
    next(err);
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const cats = await menuService.getCategories(req.user!.establishmentId!);
    res.json({ success: true, data: cats });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const cat = await menuService.createCategory(req.user!.establishmentId!, parsed.data);
    res.status(201).json({ success: true, data: cat });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid category ID' });
    return;
  }
  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const cat = await menuService.updateCategory(id, req.user!.establishmentId!, parsed.data);
    res.json({ success: true, data: cat });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid category ID' });
    return;
  }
  try {
    const cat = await menuService.deleteCategory(id, req.user!.establishmentId!);
    res.json({ success: true, data: cat });
  } catch (err) {
    next(err);
  }
}

// ─── Sub-categories ───────────────────────────────────────────────────────────

export async function createSubCategory(req: Request, res: Response, next: NextFunction) {
  const categoryId = parseInt(req.params.categoryId);
  if (isNaN(categoryId)) {
    res.status(400).json({ success: false, error: 'Invalid category ID' });
    return;
  }
  const parsed = subCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const sc = await menuService.createSubCategory(categoryId, req.user!.establishmentId!, parsed.data);
    res.status(201).json({ success: true, data: sc });
  } catch (err) {
    next(err);
  }
}

export async function updateSubCategory(req: Request, res: Response, next: NextFunction) {
  const categoryId = parseInt(req.params.categoryId);
  const id = parseInt(req.params.id);
  if (isNaN(categoryId) || isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid ID' });
    return;
  }
  const parsed = updateSubCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const sc = await menuService.updateSubCategory(id, categoryId, req.user!.establishmentId!, parsed.data);
    res.json({ success: true, data: sc });
  } catch (err) {
    next(err);
  }
}

export async function deleteSubCategory(req: Request, res: Response, next: NextFunction) {
  const categoryId = parseInt(req.params.categoryId);
  const id = parseInt(req.params.id);
  if (isNaN(categoryId) || isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid ID' });
    return;
  }
  try {
    const sc = await menuService.deleteSubCategory(id, categoryId, req.user!.establishmentId!);
    res.json({ success: true, data: sc });
  } catch (err) {
    next(err);
  }
}

// ─── Menu items ───────────────────────────────────────────────────────────────

export async function listMenuItems(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await menuService.getMenuItems(req.user!.establishmentId!);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function createMenuItem(req: Request, res: Response, next: NextFunction) {
  const parsed = menuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const item = await menuService.createMenuItem(req.user!.establishmentId!, parsed.data);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateMenuItem(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid item ID' });
    return;
  }
  const parsed = updateMenuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const item = await menuService.updateMenuItem(id, req.user!.establishmentId!, parsed.data);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function deleteMenuItem(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid item ID' });
    return;
  }
  try {
    const item = await menuService.deleteMenuItem(id, req.user!.establishmentId!);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function setItemAvailability(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid item ID' });
    return;
  }
  const { is_available } = req.body;
  if (typeof is_available !== 'boolean') {
    res.status(400).json({ success: false, error: 'is_available must be boolean' });
    return;
  }
  try {
    const establishmentId = req.user!.establishmentId!;
    const item = await menuService.setItemAvailability(id, establishmentId, is_available);
    sseManager.broadcastToEstablishment(establishmentId, {
      type: 'menu:item_availability_changed',
      establishmentId,
      payload: { item_id: item.id, is_available },
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

// ─── Discounts ────────────────────────────────────────────────────────────────

export async function listDiscounts(req: Request, res: Response, next: NextFunction) {
  try {
    const discounts = await menuService.getDiscounts(req.user!.establishmentId!);
    res.json({ success: true, data: discounts });
  } catch (err) {
    next(err);
  }
}

export async function createDiscount(req: Request, res: Response, next: NextFunction) {
  const parsed = discountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const discount = await menuService.createDiscount(req.user!.establishmentId!, parsed.data);
    res.status(201).json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
}

export async function removeDiscount(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid discount ID' });
    return;
  }
  try {
    const discount = await menuService.deactivateDiscount(id, req.user!.establishmentId!);
    res.json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
}

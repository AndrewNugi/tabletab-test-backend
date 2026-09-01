import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as tablesService from './tables.service';
import { sseManager } from '../../lib/sse';
import { AppError } from '../../lib/errors';

const createTableSchema = z.object({
  table_name: z.string().min(1).optional(),
});

const updateTableSchema = z.object({
  table_name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
}).refine((d) => d.table_name !== undefined || d.is_active !== undefined, {
  message: 'At least one field required',
});

export async function listTables(req: Request, res: Response, next: NextFunction) {
  try {
    const tables = await tablesService.getTablesForEstablishment(req.user!.establishmentId!);
    res.json({ success: true, data: tables });
  } catch (err) {
    next(err);
  }
}

export async function getTable(req: Request, res: Response, next: NextFunction) {
  const tableId = parseInt(req.params.id);
  if (isNaN(tableId)) {
    res.status(400).json({ success: false, error: 'Invalid table ID' });
    return;
  }
  try {
    const table = await tablesService.getTableById(tableId, req.user!.establishmentId!);
    res.json({ success: true, data: table });
  } catch (err) {
    next(err);
  }
}

export async function createTable(req: Request, res: Response, next: NextFunction) {
  const parsed = createTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const table = await tablesService.createTable(req.user!.establishmentId!, parsed.data.table_name);
    res.status(201).json({ success: true, data: table });
  } catch (err) {
    next(err);
  }
}

export async function updateTable(req: Request, res: Response, next: NextFunction) {
  const tableId = parseInt(req.params.id);
  if (isNaN(tableId)) {
    res.status(400).json({ success: false, error: 'Invalid table ID' });
    return;
  }
  const parsed = updateTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const table = await tablesService.updateTable(tableId, req.user!.establishmentId!, parsed.data);
    res.json({ success: true, data: table });
  } catch (err) {
    next(err);
  }
}

export async function regenerateQR(req: Request, res: Response, next: NextFunction) {
  const tableId = parseInt(req.params.id);
  if (isNaN(tableId)) {
    res.status(400).json({ success: false, error: 'Invalid table ID' });
    return;
  }
  try {
    const result = await tablesService.regenerateTableQR(tableId, req.user!.establishmentId!);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function closeTableSession(req: Request, res: Response, next: NextFunction) {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ success: false, error: 'Invalid session ID' });
    return;
  }
  try {
    const establishmentId = req.user!.establishmentId!;
    const session = await tablesService.closeSession(sessionId, establishmentId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }
    sseManager.broadcastToSession(sessionId, {
      type: 'table:session_closed',
      establishmentId,
      payload: { sessionId },
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

// Public — called when a customer scans a QR code
export async function initCustomerSession(req: Request, res: Response, next: NextFunction) {
  const tableId = parseInt(req.params.tableId);
  if (isNaN(tableId)) {
    res.status(400).json({ success: false, error: 'Invalid table ID' });
    return;
  }
  try {
    const db = (await import('../../lib/db')).default;
    const { rows } = await db.query(
      'SELECT * FROM tables WHERE id = $1',
      [tableId]
    );
    const table = rows[0];
    if (!table) {
      res.status(404).json({ success: false, error: 'Table not found' });
      return;
    }
    if (!table.is_active) {
      res.status(200).json({
        success: false,
        deactivated: true,
        error: 'This table is not currently active. Please speak to a member of our staff and they will be happy to assist you.',
      });
      return;
    }
    const session = await tablesService.getOrCreateSession(tableId, table.establishment_id as number);
    res.json({ success: true, data: { session, table } });
  } catch (err) {
    next(err);
  }
}

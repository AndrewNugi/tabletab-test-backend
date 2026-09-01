// Duplicated from @tabletab/shared — this repo deploys standalone (no npm
// workspace), so that package isn't resolvable via a normal `npm install`.
// Type-only, so there's no runtime code to keep in sync, just these two shapes.

export type UserRole = 'superadmin' | 'super_manager' | 'admin' | 'waiter';

export type SSEEventType =
  | 'order:new'
  | 'order:status_changed'
  | 'payment:confirmed'
  | 'table:session_closed'
  | 'menu:item_availability_changed';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  establishmentId: number;
  payload: T;
  timestamp: string;
}

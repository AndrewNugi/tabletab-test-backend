# TableTab — Backend Modules Overview

> **Stack:** Express + TypeScript, PostgreSQL, JWT (httpOnly cookie), Zod, SSE, M-Pesa Daraja (payments — excluded from this report)
>
> **Architecture pattern per module:** Router → Controller → Service → DB
> - Router: declares endpoints, applies middleware guards
> - Controller: validates input (Zod), calls service, sends response, passes errors to `next(err)`
> - Service: pure business logic + SQL queries, throws `AppError` for domain errors
> - ErrorHandler middleware: converts `AppError` / JWT errors to the correct HTTP status

---

## Role Hierarchy

All access control is built around four roles:

```
superadmin
  └── super_manager   (owns a single establishment)
        └── admin     (scoped under super_manager, reduced permissions)
              └── waiter  (order visibility only)
```

Two middleware functions enforce this:

- **`requireRole(...roles)`** — allowlist check. Request must carry one of the listed roles or it gets a 403.
- **`requireEstablishment`** — enforces that the user has an `establishmentId` in their token. Only `superadmin` bypasses this; every other role must belong to a specific establishment.

---

## 1. Auth Module

### Purpose
Handles login, logout, token issuance, and the special short-lived SSE token. There are no refresh tokens — a session lasts 6 hours and the user must log in again after that.

### Key Files
- `auth.service.ts` — password verification, JWT signing
- `auth.controller.ts` — HTTP handlers
- `auth.router.ts` — route declarations
- `auth.validation.ts` — Zod schema for login body
- `middleware/auth.ts` — `authenticate`, `requireRole`, `requireEstablishment`

### Logic Breakdown

**JWT payload (`AuthPayload`):**
```ts
{
  userId: number
  email: string
  role: UserRole               // 'superadmin' | 'super_manager' | 'admin' | 'waiter'
  establishmentId: number | null
  organisationId: number | null
}
```

**Token storage:** The JWT is stored in an `httpOnly` cookie named `tabletab_token`. This prevents JavaScript from reading it (XSS protection). The `authenticate` middleware reads the cookie first; if absent it falls back to a `Bearer` header (for Postman testing).

**TTL:** Access tokens expire after 6 hours (`ACCESS_TTL_SEC = 6 * 60 * 60`). The `maxAge` on the cookie is set to the same value in milliseconds. Once expired, the user must log in again — no refresh token exists.

**SSE token:** A separate 60-second JWT with an extra `type: 'sse'` claim. It is issued on demand via `POST /api/auth/sse-token`. Its short life means that even if it appears in server logs (it goes in a query param), it is useless within a minute.

**Logout:** Client-side only. The server clears the cookie in the response. The original JWT remains cryptographically valid until expiry but the browser no longer holds it, so all future requests are unauthenticated.

### E2E Flow — Login

```
Client                         Backend
  │                               │
  ├─ POST /api/auth/login ────────►│
  │  { email, password }          │
  │                               ├─ Zod validates body
  │                               ├─ Queries DB for user by email
  │                               ├─ Throws AppError(401) if not found
  │                               ├─ Throws AppError(403) if is_active = false
  │                               ├─ bcrypt.compare(password, hash)
  │                               ├─ Throws AppError(401) if mismatch
  │                               ├─ jwt.sign(payload, secret, { expiresIn: 21600 })
  │                               ├─ res.cookie('tabletab_token', token, { httpOnly: true })
  │◄──────────────────────────────┤
  │  200 { success, data: { token, user } }
```

### E2E Flow — Authenticated Request

```
Client                         authenticate middleware
  │                               │
  ├─ GET /api/... ───────────────►│
  │  Cookie: tabletab_token=...   │
  │                               ├─ Reads cookie (or Authorization header)
  │                               ├─ jwt.verify(token, secret)
  │                               │   ─ TokenExpiredError → next(err) → 401
  │                               │   ─ JsonWebTokenError  → next(err) → 401
  │                               ├─ req.user = decoded payload
  │                               ├─ next() → route handler runs
```

### Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Email + password → JWT cookie |
| `POST` | `/api/auth/logout` | Public | Clears cookie |
| `POST` | `/api/auth/sse-token` | Any authenticated | Issues 60s SSE token |
| `GET` | `/api/auth/me` | Any authenticated | Returns decoded token payload |

### Expected Outcomes

- Correct credentials → `200` with token set in cookie and user object in body
- Wrong credentials → `401 Invalid credentials`
- Deactivated account → `403 Account is deactivated`
- Missing / malformed token on protected routes → `401`
- Expired token → `401 Token expired`

---

## 2. Tables Module

### Purpose
Manages the physical tables of an establishment. Each table has a permanent QR code that never changes. Scanning the QR opens (or resumes) a table session, which is the anchor point for all orders placed at that table.

### Key Files
- `tables.service.ts` — DB operations, QR generation, session management
- `tables.controller.ts` — HTTP handlers with Zod validation
- `tables.router.ts` — route declarations with role guards

### Logic Breakdown

**Table identity:** Tables are identified by their integer DB `id`. The optional `table_name` column is a human-readable label (e.g. "Window Seat", "Bar 3") that staff can set or edit. The DB ID never changes so the QR code stays valid forever.

**QR code:** Generated once on table creation using the `qrcode` library. The encoded URL is:
```
{QR_BASE_URL}/menu/{establishmentId}?table={tableId}
```
Stored as a base64 data URL in the `qr_code_url` column. When a customer scans it, their browser navigates to the frontend which then calls `GET /api/tables/init/:tableId`.

**Table sessions:** A session represents one "sitting" at a table — from the moment someone scans the QR to when a staff member closes it. Sessions have statuses:
- `active` — table is occupied, orders can be placed
- `awaiting_payment` — all orders placed, pending final settlement
- `closed` — session ended

`getOrCreateSession` checks for an existing open session. If none exists, it closes any stale sessions and opens a fresh one. This means the same QR code always works — it either resumes an active session or starts a new one.

**Deactivated tables:** If `is_active = false`, `initCustomerSession` returns a `200` with `deactivated: true` and a warm message asking the customer to speak to staff. A `404` is not used here because the table exists — it is just temporarily unavailable.

### E2E Flow — Customer Scans QR

```
Customer phone                  Backend
  │                               │
  ├─ Scans QR code ──────────────►│  (browser opens /menu/{estId}?table={tableId})
  │                               │
  ├─ GET /api/tables/init/:tableId►│
  │                               ├─ Fetches table by ID
  │                               ├─ If not found → 404
  │                               ├─ If is_active = false → 200 { deactivated: true, error: warm message }
  │                               ├─ getOrCreateSession(tableId, establishmentId)
  │                               │   ├─ Checks for existing open session
  │                               │   └─ If none: closes any stale sessions, inserts new session
  │◄──────────────────────────────┤
  │  200 { success, data: { session, table } }
  │
  │  (frontend stores session.id — all orders are scoped to this)
```

### E2E Flow — Staff Creates a Table

```
Manager                         Backend
  │                               │
  ├─ POST /api/tables ───────────►│
  │  { table_name: "Table 4" }   ├─ Zod validates body
  │  Bearer token (admin+)        ├─ requireRole check
  │                               ├─ INSERT INTO tables ...
  │                               ├─ generateAndStoreQR(table.id, establishmentId)
  │                               │   ├─ Builds URL with tableId
  │                               │   ├─ QRCode.toDataURL(url)
  │                               │   └─ UPDATE tables SET qr_code_url = ...
  │◄──────────────────────────────┤
  │  201 { success, data: table } │  (includes qr_code_url — frontend renders for printing)
```

### Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tables/init/:tableId` | Public | Customer scans QR, opens/resumes session |
| `GET` | `/api/tables` | Staff (any) | List all active tables with session status |
| `POST` | `/api/tables` | admin+ | Create table, generate QR |
| `GET` | `/api/tables/:id` | Staff (any) | Get single table (for print view) |
| `PATCH` | `/api/tables/:id` | admin+ | Edit `table_name` or `is_active` |
| `POST` | `/api/tables/sessions/:sessionId/close` | admin+ | Close a table session |

### Expected Outcomes

- Creating a table → `201` with table row including `qr_code_url` (base64 PNG)
- Scanning an active table QR → `200` with session + table
- Scanning a deactivated table QR → `200` with `{ deactivated: true, error: "..." }`
- Deactivating a table → `PATCH` with `{ is_active: false }` → `200` with updated row
- Closing a session → `200` with closed session row; SSE pushes `table:session_closed` to the customer screen

---

## 3. Menu Module

### Purpose
Manages the full menu structure: categories → sub-categories → items. Has two audiences: customers (public, active items only) and managers (all items including inactive, for management).

### Key Files
- `menu.service.ts` — DB operations with explicit column whitelists for safe updates
- `menu.controller.ts` — HTTP handlers, Zod schemas for all write routes
- `menu.router.ts` — route declarations

### Logic Breakdown

**Menu tree structure:**
```
Category
  ├── MenuItem (directly under category)
  └── SubCategory
        └── MenuItem (under sub-category)
```

**Public vs management views:**
- `GET /api/menu/establishment/:id` — public. Returns only `is_active = TRUE` categories and `is_active = TRUE` items, assembled into the tree structure in a single pass using Maps. Used by the customer-facing menu page.
- `GET /api/menu/categories` and `GET /api/menu/items` — manager only. Returns all records regardless of `is_active`, so managers can see and restore deactivated items.

**Safe updates (SQL injection prevention):** Update functions iterate over a hardcoded `allowed` array of column names, not over `req.body` keys. Values are always parameterised (`$1`, `$2`, ...). This means even if unexpected fields appear in the request body, they are silently ignored — they never touch the SQL.

```ts
// Safe pattern used in updateCategory and updateMenuItem
const allowed = ['name', 'description', 'sort_order', 'is_active'] as const;
for (const col of allowed) {
  if (col in data && data[col] !== undefined) {
    fields.push(`${col} = $${i++}`);
    values.push(data[col]);
  }
}
```

**Soft delete:** Deleting a category or item sets `is_active = false` rather than removing the row. This preserves historical order data that references these items. The item disappears from the public menu immediately but can be restored via `PATCH`.

**Availability vs active:**
- `is_active` — whether the item exists on the menu at all
- `is_available` — whether the item is currently in stock (can be toggled quickly, broadcasts via SSE)

Toggling `is_available = false` (e.g. "sold out tonight") broadcasts a `menu:item_availability_changed` SSE event so the customer menu page updates in real time without a page refresh.

**Category ownership validation:** When creating or moving a menu item, the service verifies that the target `category_id` belongs to the same `establishment_id`. This prevents cross-establishment data leakage.

### E2E Flow — Customer Views Menu

```
Customer browser                Backend
  │                               │
  ├─ GET /api/menu/establishment/1►│
  │                               ├─ Queries categories WHERE is_active = TRUE
  │                               ├─ Queries sub_categories (joined to active categories)
  │                               ├─ Queries menu_items WHERE is_active = TRUE
  │                               ├─ Assembles tree using Map lookups
  │◄──────────────────────────────┤
  │  200 { success, data: [       │
  │    {                          │
  │      ...category,             │
  │      items: [...],            │
  │      sub_categories: [        │
  │        { ...subcat, items: [...] }
  │      ]                        │
  │    }                          │
  │  ]}                           │
```

### E2E Flow — Manager Adds a Menu Item

```
Manager                         Backend
  │                               │
  ├─ POST /api/menu/items ───────►│
  │  { category_id, name,         ├─ Zod validates body
  │    price, description }       ├─ requireRole('super_manager', 'admin', 'superadmin')
  │                               ├─ Verifies category_id belongs to establishment
  │                               │   └─ AppError(404) if not found
  │                               ├─ INSERT INTO menu_items ...
  │◄──────────────────────────────┤
  │  201 { success, data: item }  │
```

### E2E Flow — Waiter Toggles Item Availability

```
Waiter                          Backend                     Customer SSE stream
  │                               │                               │
  ├─ PATCH /api/menu/items/5/availability ──►│                   │
  │  { is_available: false }       ├─ UPDATE menu_items SET is_available = false
  │                                ├─ sseManager.broadcastToEstablishment(...)
  │◄──────────────────────────────┤                ──────────────►│
  │  200 { success, data: item }  │       event: menu:item_availability_changed
```

### Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/menu/establishment/:id` | Public | Full active menu tree for customers |
| `GET` | `/api/menu/categories` | admin+ | All categories (inc. inactive) for management |
| `POST` | `/api/menu/categories` | admin+ | Create category |
| `PATCH` | `/api/menu/categories/:id` | admin+ | Edit name, description, sort order, or active flag |
| `DELETE` | `/api/menu/categories/:id` | admin+ | Soft-delete (sets `is_active = false`) |
| `POST` | `/api/menu/categories/:id/sub-categories` | admin+ | Add sub-category under a category |
| `GET` | `/api/menu/items` | admin+ | All items (inc. inactive) for management |
| `POST` | `/api/menu/items` | admin+ | Create item |
| `PATCH` | `/api/menu/items/:id` | admin+ | Edit item fields |
| `DELETE` | `/api/menu/items/:id` | admin+ | Soft-delete item |
| `PATCH` | `/api/menu/items/:id/availability` | admin+ | Toggle in-stock status, broadcasts SSE |

### Expected Outcomes

- Public menu fetch → `200` with nested tree (categories → sub-categories → items), active only
- Create item with invalid `category_id` → `404 Category not found`
- Update with empty body → `400 At least one field required`
- Soft-delete category → `200` with updated row; category vanishes from public menu immediately
- Toggle availability → `200`; connected customer browsers receive SSE event

---

## 4. Orders Module

### Purpose
Handles the full lifecycle of an order from placement to delivery. Enforces the payment-first model: an order is invisible to waiters until its payment is confirmed.

### Key Files
- `orders.service.ts` — order creation (transactional), status transitions, SSE broadcasts
- `orders.controller.ts` — HTTP handlers, Zod validation, NaN guards
- `orders.router.ts` — routes with rate limiting on the public place-order endpoint

### Logic Breakdown

**Order statuses:**
```
awaiting_payment  →  pending  →  in_progress  →  delivered
     (hidden from waiters)
```

- `awaiting_payment` — order exists in DB but payment has not been confirmed. Waiters cannot see it. This prevents staff from preparing food that may never be paid for.
- `pending` — payment confirmed (set by the payments module via `markOrderPaid`). Now visible on the waiter screen.
- `in_progress` — waiter acknowledged the order. Customer screen updates.
- `delivered` — waiter scanned/typed the confirmation code at the table. Order complete.

**Payment-first enforcement:** `getOrdersForEstablishment` and `getOrdersForSession` both filter `WHERE status != 'awaiting_payment'`. Customers viewing their own session also cannot see unpaid orders.

**Transactional order creation:** `createOrder` wraps the insert into a DB transaction. The order header row and all `order_items` rows are inserted together. If any item insert fails, the entire order is rolled back — no orphaned order headers exist.

**Price integrity:** Prices are read from the DB at order time, not from the client. The client sends `menu_item_id` and `quantity` only. The service fetches the current price from `menu_items` and calculates the total server-side. This prevents price manipulation from the frontend.

**Confirmation code:** An 8-character uppercase alphanumeric code (`ABCD1234`) is generated at order creation using UUID v4 stripped of dashes. The customer's screen displays this as a QR or plain text. When the waiter delivers the food, they enter or scan this code to confirm delivery — it proves the right table received the right order.

**Rate limiting:** `POST /api/orders/establishment/:id/place` is rate-limited to 10 requests per minute per IP. This prevents a customer from spamming orders.

**SSE broadcasts:** Every status transition broadcasts to relevant parties:

| Transition | Broadcast to |
|---|---|
| `awaiting_payment` → `pending` (payment confirmed) | Waiters + managers (new order alert); customer (order accepted) |
| `pending` → `in_progress` (receipt confirmed) | Customer screen; waiters + managers |
| `in_progress` → `delivered` | Customer screen; waiters + managers |

### E2E Flow — Full Order Lifecycle

```
Customer                        Backend                         Waiter screen
  │                               │                               │
  ├─ POST /api/orders/            │                               │
  │    establishment/1/place ────►│                               │
  │  { table_session_id,          ├─ Zod validates body           │
  │    items: [{ menu_item_id,    ├─ Fetches prices from DB       │
  │             quantity }] }     ├─ Validates all items exist    │
  │                               │   and are available           │
  │                               ├─ Calculates total server-side │
  │                               ├─ BEGIN transaction            │
  │                               ├─ INSERT orders (status: awaiting_payment)
  │                               ├─ INSERT order_items (×n)      │
  │                               ├─ COMMIT                       │
  │◄──────────────────────────────┤                               │
  │  201 { order }                │                               │
  │  (includes confirmation_code) │                               │
  │                               │                               │
  │  [Customer pays via M-Pesa — payments module confirms]        │
  │                               │                               │
  │                               ├─ markOrderPaid(orderId) ─────►│
  │◄──────────────────────────────┤  SSE: order:new ─────────────►│
  │  SSE: order:status_changed    │                               │
  │       { status: 'pending' }   │                               │
  │                               │                               │
  │                               │◄── POST /api/orders/:id/confirm-receipt
  │                               ├─ UPDATE orders SET status = 'in_progress'
  │◄──────────────────────────────┤                               │
  │  SSE: order:status_changed    ├─ SSE: order:status_changed ──►│
  │       { status: 'in_progress'}│                               │
  │                               │                               │
  │  [Waiter brings food, customer shows confirmation code]        │
  │                               │                               │
  │                               │◄── POST /api/orders/confirm-delivery
  │                               │    { confirmation_code: "ABCD1234" }
  │                               ├─ UPDATE orders SET status = 'delivered'
  │◄──────────────────────────────┤                               │
  │  SSE: order:status_changed    ├─ SSE: order:status_changed ──►│
  │       { status: 'delivered' } │                               │
```

### Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/orders/establishment/:id/place` | Public (rate limited) | Customer places order |
| `GET` | `/api/orders/session/:sessionId` | Public | Customer views their session's orders |
| `GET` | `/api/orders` | Staff (any) | List paid orders; filter with `?status=` |
| `POST` | `/api/orders/:id/confirm-receipt` | waiter+ | Move order to `in_progress` |
| `POST` | `/api/orders/confirm-delivery` | waiter+ | Move order to `delivered` via code |

### Expected Outcomes

- Place order with unavailable item → `400 {item name} is currently unavailable`
- Place order with unknown item ID → `400 Menu item {id} not found`
- Confirm receipt of non-pending order → `404 Order not found or cannot be confirmed`
- Confirm delivery with wrong code → `404 Invalid code or order not in progress`
- Successful placement → `201` with order including `confirmation_code`
- `GET /api/orders` → returns all orders except `awaiting_payment` ones

---

## 5. Staff Module

### Purpose
Allows `super_manager` and `admin` to manage the staff members within their establishment — listing them and toggling their active status.

### Key Files
- `staff.router.ts` — routes, Zod schema, asyncHandler wrappers, all inline
- `staff.service.ts` — DB operations

### Logic Breakdown

**Who can manage staff:** `super_manager`, `admin`, and `superadmin`. All are also required to pass `requireEstablishment` (superadmin bypasses this automatically).

**Role constraint on creation:** The Zod schema for `POST /api/staff` only allows `role: 'admin' | 'waiter'`. A `super_manager` cannot use this endpoint to create another `super_manager`. That privilege belongs to the `superadmin` level only.

**Scoping:** All queries are scoped to `req.user.establishmentId`. A manager at Establishment A cannot list or modify staff at Establishment B.

**Deactivation vs deletion:** Staff are never deleted. Setting `is_active = false` blocks their login (`loginUser` throws `AppError(403)`) but preserves their record and all audit history.

**Email uniqueness:** PostgreSQL enforces a unique constraint on the `email` column. The service detects the duplicate error message from the DB driver and returns a clean `400 Email already exists` instead of a raw 500.

### E2E Flow — Create a Waiter

```
Super Manager                   Backend
  │                               │
  ├─ POST /api/staff ────────────►│
  │  { first_name, last_name,     ├─ authenticate → requireRole → requireEstablishment
  │    email, password,           ├─ Zod validates body (role must be 'admin' or 'waiter')
  │    role: 'waiter' }           ├─ hashPassword(password) [bcrypt, cost 10]
  │                               ├─ INSERT INTO users (establishment_id, organisation_id, ...)
  │◄──────────────────────────────┤
  │  201 { success, data: user }  │  (password_hash never returned)
```

### Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/staff` | admin+ | List all staff in establishment |
| `POST` | `/api/staff` | admin+ | Create a new waiter or admin |
| `PATCH` | `/api/staff/:id/status` | admin+ | Activate or deactivate a staff member |

### Expected Outcomes

- Create staff with duplicate email → `400 Email already exists`
- Attempt to create `super_manager` role → `400` (Zod rejects, not in enum)
- Deactivate staff member → `200`; that user's next login attempt returns `403 Account is deactivated`
- Toggle `is_active: true` → re-enables login

---

## 6. Reports Module

### Purpose
Provides summary analytics for a single establishment — revenue, order count, top-selling items, and active table count. Intended for the manager dashboard.

### Key Files
- `reports.router.ts` — single endpoint, logic inline with `asyncHandler`

### Logic Breakdown

**Access:** `super_manager`, `admin`, `superadmin` only — waiters cannot see financial data.

**Period filter:** The `?period=` query parameter accepts `day` (default), `week`, or `month`. This maps to a PostgreSQL `INTERVAL` used in a `WHERE placed_at >= NOW() - INTERVAL '...'` clause.

**Three queries run in parallel (conceptually):**
1. **Revenue** — sums `final_amount` from orders joined to confirmed payments. Uses `COALESCE(..., 0)` so it returns `0` instead of `null` when there are no orders.
2. **Top items** — counts quantity sold per menu item from `order_items` for delivered orders. Returns top 10.
3. **Active tables** — counts `table_sessions` with `status = 'active'`. Gives a live snapshot of how many tables are currently occupied.

> Note: The revenue query joins `payments` on `p.status = 'confirmed'`. This means it only counts revenue where the M-Pesa payment was actually confirmed — no double-counting from pending payments.

### E2E Flow

```
Manager                         Backend
  │                               │
  ├─ GET /api/reports/summary     │
  │    ?period=week ─────────────►│
  │                               ├─ authenticate → requireRole → requireEstablishment
  │                               ├─ Determines interval ('7 days')
  │                               ├─ Query 1: SUM revenue + COUNT orders (confirmed payments)
  │                               ├─ Query 2: Top 10 items by quantity (delivered orders)
  │                               ├─ Query 3: COUNT active table sessions
  │◄──────────────────────────────┤
  │  200 {                        │
  │    revenue: {                 │
  │      total_revenue: "45200.00"│
  │      total_orders: "38"       │
  │    },                         │
  │    top_items: [               │
  │      { name: "Nyama Choma",   │
  │        total_quantity: "24" } │
  │    ],                         │
  │    active_tables: "5"         │
  │  }                            │
```

### Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/reports/summary` | admin+ | Revenue, top items, active tables for a period |

### Expected Outcomes

- `?period=day` → last 24 hours of data (default)
- `?period=week` → last 7 days
- `?period=month` → last 30 days
- No orders in period → `total_revenue: "0"`, `total_orders: "0"`, `top_items: []`

---

## 7. SSE Module

### Purpose
Server-Sent Events (SSE) is the real-time channel between the backend and connected clients. The backend pushes events over a persistent HTTP connection — no WebSocket, no polling. There are two streams: one for staff (authenticated) and one for customers (session-scoped, public).

### Key Files
- `lib/sse.ts` — `SSEManager` class that holds all connected clients and broadcasts to them
- `modules/sse/sse.router.ts` — two GET endpoints that upgrade to SSE streams

### Logic Breakdown

**`SSEManager`:** An in-memory singleton that stores all active connections in a `Map<clientId, SSEClient>`. Each `SSEClient` holds the Express `Response` object (kept open), the `establishmentId`, the `role`, and optionally a `sessionId` for customer streams. When an event needs to be pushed, `SSEManager` iterates the map and writes to matching connections.

**Staff stream (`GET /api/sse/staff`):**
- Requires an SSE token in the query string: `?token=<60s JWT>`
- The token is verified with `jwt.verify()` and must have `type: 'sse'` — a regular 6-hour access token is rejected here. This prevents the main token from ever appearing in URL logs.
- The client's `role` is stored as-is from the token payload, so `broadcastToEstablishment` can filter by role (e.g. only send new order alerts to `waiter` and `admin`, not to `customer`).
- A heartbeat comment (`: heartbeat`) is sent every 25 seconds to keep the connection alive through proxies and load balancers.

**Customer stream (`GET /api/sse/customer/:sessionId?eid=<establishmentId>`):**
- No authentication. The customer is identified by their session ID.
- Events are broadcast to this stream using `broadcastToSession(sessionId, event)`, which matches on `client.sessionId`.

**Connection cleanup:** Both streams attach a listener to the `req.on('close')` event. When the client disconnects (browser tab closed, network drop), the interval is cleared and the client is removed from the map.

**SSE wire format:**
```
event: order:new
data: {"type":"order:new","establishmentId":1,"payload":{...},"timestamp":"..."}

```
Each message is two lines followed by a blank line. The `event:` line lets the client use `addEventListener('order:new', handler)` instead of a generic `onmessage`.

### E2E Flow — Staff Connects to SSE

```
Waiter browser                  Backend
  │                               │
  ├─ POST /api/auth/sse-token ───►│  (with main cookie)
  │◄──────────────────────────────┤
  │  { token: "<60s JWT>" }       │
  │                               │
  ├─ GET /api/sse/staff           │
  │    ?token=<60s JWT> ─────────►│
  │                               ├─ jwt.verify(token) — must have type: 'sse'
  │                               ├─ Sets Content-Type: text/event-stream
  │                               ├─ res.flushHeaders() — connection stays open
  │                               ├─ sseManager.addClient(uuid, { res, establishmentId, role })
  │◄──────────────────────────────┤
  │  event: connected             │
  │  data: {"clientId":"..."}     │
  │                               │
  │  [connection stays open — server pushes events as they happen]
  │                               │
  │◄──────────────────────────────┤
  │  event: order:new             │  (when a payment is confirmed)
  │  data: { order + items }      │
  │                               │
  │◄──────────────────────────────┤
  │  : heartbeat                  │  (every 25 seconds — keeps connection alive)
```

### SSE Event Types

| Event | Triggered by | Sent to |
|---|---|---|
| `order:new` | Payment confirmed | Waiters + managers |
| `order:status_changed` | Receipt confirmed / delivery confirmed | Customer screen + waiters + managers |
| `table:session_closed` | Staff closes session | Customer screen (that session only) |
| `menu:item_availability_changed` | Item toggled unavailable | All connected customer browsers for that establishment |

### Expected Outcomes

- Staff connects with valid SSE token → persistent connection, receives events for their establishment
- Staff connects with regular access token (not SSE token) → `401` immediately
- Customer connects → receives only events for their `sessionId` (order updates) or establishment-wide menu changes
- Server restarts → all connections drop; clients must reconnect (frontend handles reconnect via `EventSource` API which auto-reconnects by default)

---

## Cross-Cutting Concerns

### Error Handling

All domain errors use `AppError(message, status)`. Unexpected errors are passed to `next(err)`. The `errorHandler` middleware at the bottom of `app.ts` converts them:

```
AppError           → { success: false, error: message }  with AppError.status
TokenExpiredError  → 401 Token expired
JsonWebTokenError  → 401 Invalid token
anything else      → 500 Internal server error (stack logged server-side)
```

### Request Validation

Every write endpoint validates input with Zod before the service layer is touched. Invalid input returns `400` with a structured `error.flatten()` object showing exactly which fields failed and why.

### SQL Safety

No user-supplied strings are ever interpolated into SQL. All values go through parameterised queries (`$1`, `$2`, ...). For dynamic update queries (where the SET clause varies), column names come from a hardcoded `allowed` array — never from request body keys.

### Scoping

Every DB query in a scoped module includes `AND establishment_id = $n`. A manager authenticated to Establishment A cannot read or modify data belonging to Establishment B, even if they manually guess IDs.

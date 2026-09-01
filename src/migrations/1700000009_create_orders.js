/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE order_status AS ENUM ('awaiting_payment', 'pending', 'in_progress', 'delivered', 'cancelled');

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      table_session_id INTEGER NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
      status order_status NOT NULL DEFAULT 'awaiting_payment',
      total_amount NUMERIC(10, 2) NOT NULL,
      discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
      final_amount NUMERIC(10, 2) NOT NULL,
      confirmation_code VARCHAR(20) NOT NULL UNIQUE,
      placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(10, 2) NOT NULL,
      notes TEXT
    );

    CREATE INDEX idx_orders_table_session_id ON orders(table_session_id);
    CREATE INDEX idx_orders_establishment_id ON orders(establishment_id);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_orders_confirmation_code ON orders(confirmation_code);
    CREATE INDEX idx_order_items_order_id ON order_items(order_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TYPE IF EXISTS order_status;
  `);
};

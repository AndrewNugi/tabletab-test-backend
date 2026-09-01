/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'failed');

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      table_session_id INTEGER NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      method VARCHAR(20) NOT NULL DEFAULT 'mpesa',
      mpesa_ref VARCHAR(100),
      phone_number VARCHAR(20) NOT NULL,
      status payment_status NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_payments_order_id ON payments(order_id);
    CREATE INDEX idx_payments_table_session_id ON payments(table_session_id);
    CREATE INDEX idx_payments_status ON payments(status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS payments;
    DROP TYPE IF EXISTS payment_status;
  `);
};

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE orders ADD COLUMN assigned_waiter_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX idx_orders_assigned_waiter_id ON orders(assigned_waiter_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_orders_assigned_waiter_id;
    ALTER TABLE orders DROP COLUMN IF EXISTS assigned_waiter_id;
  `);
};

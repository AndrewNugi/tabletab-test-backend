/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tables ADD COLUMN assigned_waiter_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX idx_tables_assigned_waiter_id ON tables(assigned_waiter_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_tables_assigned_waiter_id;
    ALTER TABLE tables DROP COLUMN IF EXISTS assigned_waiter_id;
  `);
};

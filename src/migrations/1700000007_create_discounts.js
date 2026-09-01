/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');
    CREATE TYPE discount_target AS ENUM ('menu', 'category', 'item');

    CREATE TABLE IF NOT EXISTS discounts (
      id SERIAL PRIMARY KEY,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type discount_type NOT NULL,
      value NUMERIC(10, 2) NOT NULL,
      applies_to discount_target NOT NULL,
      target_id INTEGER,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_discounts_establishment_id ON discounts(establishment_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS discounts;
    DROP TYPE IF EXISTS discount_target;
    DROP TYPE IF EXISTS discount_type;
  `);
};

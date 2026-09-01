/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS tables (
      id SERIAL PRIMARY KEY,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
      table_number VARCHAR(50) NOT NULL,
      label VARCHAR(100),
      qr_code_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(establishment_id, table_number)
    );

    CREATE INDEX idx_tables_establishment_id ON tables(establishment_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS tables;`);
};

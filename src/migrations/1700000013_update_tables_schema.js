/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_establishment_id_table_number_key;
    ALTER TABLE tables DROP COLUMN IF EXISTS table_number;
    ALTER TABLE tables ADD COLUMN IF NOT EXISTS table_name VARCHAR(100);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tables DROP COLUMN IF EXISTS table_name;
    ALTER TABLE tables ADD COLUMN IF NOT EXISTS table_number VARCHAR(50) NOT NULL DEFAULT '';
    ALTER TABLE tables ADD CONSTRAINT tables_establishment_id_table_number_key
      UNIQUE (establishment_id, table_number);
  `);
};

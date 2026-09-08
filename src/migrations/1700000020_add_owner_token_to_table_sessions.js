/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE table_sessions ADD COLUMN owner_token TEXT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE table_sessions DROP COLUMN IF EXISTS owner_token;
  `);
};

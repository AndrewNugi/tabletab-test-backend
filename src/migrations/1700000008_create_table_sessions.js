/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE session_status AS ENUM ('active', 'awaiting_payment', 'closed');

    CREATE TABLE IF NOT EXISTS table_sessions (
      id SERIAL PRIMARY KEY,
      table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
      establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      status session_status NOT NULL DEFAULT 'active'
    );

    CREATE INDEX idx_table_sessions_table_id ON table_sessions(table_id);
    CREATE INDEX idx_table_sessions_establishment_id ON table_sessions(establishment_id);
    CREATE INDEX idx_table_sessions_status ON table_sessions(status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS table_sessions;
    DROP TYPE IF EXISTS session_status;
  `);
};

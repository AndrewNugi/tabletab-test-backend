/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER,
      actor_role VARCHAR(20),
      action VARCHAR(100) NOT NULL,
      target_table VARCHAR(100),
      target_id INTEGER,
      change_delta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
    CREATE INDEX idx_audit_logs_target ON audit_logs(target_table, target_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS audit_logs;`);
};

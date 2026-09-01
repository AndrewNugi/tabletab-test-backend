/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'manager', 'waiter');

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      establishment_id INTEGER REFERENCES establishments(id) ON DELETE SET NULL,
      organisation_id INTEGER REFERENCES organisations(id) ON DELETE SET NULL,
      role user_role NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_users_establishment_id ON users(establishment_id);
    CREATE INDEX idx_users_email ON users(email);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS users;
    DROP TYPE IF EXISTS user_role;
  `);
};

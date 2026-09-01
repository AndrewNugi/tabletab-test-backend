/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ALTER COLUMN role TYPE text;
    DROP TYPE user_role;
    CREATE TYPE user_role AS ENUM ('superadmin', 'super_manager', 'admin', 'waiter');
    UPDATE users SET role = 'super_manager' WHERE role = 'manager';
    ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ALTER COLUMN role TYPE text;
    DROP TYPE user_role;
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'manager', 'waiter');
    UPDATE users SET role = 'manager' WHERE role = 'super_manager';
    ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
  `);
};

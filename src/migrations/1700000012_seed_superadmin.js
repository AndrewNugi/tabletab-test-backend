/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO organisations (name) VALUES ('TableTab Demo Org')
    ON CONFLICT DO NOTHING;

    INSERT INTO establishments (organisation_id, name, address, phone)
    SELECT id, 'Demo Restaurant', 'Nairobi, Kenya', '+254700000000'
    FROM organisations WHERE name = 'TableTab Demo Org'
    ON CONFLICT DO NOTHING;

    INSERT INTO users (establishment_id, organisation_id, role, first_name, last_name, email, password_hash)
    SELECT
      NULL,
      NULL,
      'superadmin',
      'Super',
      'Admin',
      'superadmin@tabletab.dev',
      '$2b$10$c2CpnPnbJ4oZIWvxMdEBZOra0wAcB3PtldZLmCG0QN.VxY/rBXlmG'
    ON CONFLICT (email) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM users WHERE email = 'superadmin@tabletab.dev';
    DELETE FROM establishments WHERE name = 'Demo Restaurant';
    DELETE FROM organisations WHERE name = 'TableTab Demo Org';
  `);
};

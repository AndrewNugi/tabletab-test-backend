/**
 * Seeds a second establishment and inserts sandbox Daraja credentials for
 * both establishments.
 *
 * consumer_key, consumer_secret, and passkey are stored NULL here.
 * Set them via the API after migrations run:
 *
 *   PUT /api/payments/credentials/:establishmentId
 *   { consumer_key, consumer_secret, passkey }   (superadmin/super_manager only)
 *
 * The service encrypts them with AES-256-GCM before writing to the DB.
 * Shortcode 174379 is Safaricom's published sandbox shortcode.
 */

const SANDBOX_SHORTCODE = '174379';

exports.up = (pgm) => {
  // Second establishment (establishment 1 already exists from the initial seed)
  pgm.sql(`
    INSERT INTO establishments (id, organisation_id, name, address, is_active)
    VALUES (2, 1, 'Demo Bar', 'Nairobi, Kenya', true)
    ON CONFLICT (id) DO NOTHING;
  `);

  // consumer_key / consumer_secret / passkey start NULL — set via API after migration
  pgm.sql(`
    INSERT INTO establishment_daraja_credentials
      (establishment_id, business_shortcode, consumer_key, consumer_secret, passkey, mpesa_env)
    VALUES
      (1, '${SANDBOX_SHORTCODE}', NULL, NULL, NULL, 'sandbox'),
      (2, '${SANDBOX_SHORTCODE}', NULL, NULL, NULL, 'sandbox')
    ON CONFLICT (establishment_id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM establishment_daraja_credentials WHERE establishment_id IN (1, 2);`);
  pgm.sql(`DELETE FROM establishments WHERE id = 2;`);
};

/**
 * Adds per-establishment Daraja credentials table and the checkout request ID
 * column on payments (needed to correlate Daraja callbacks to the right payment row).
 */

exports.up = (pgm) => {
  // Column that Daraja returns on STK push — used to match the callback
  pgm.sql(`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS mpesa_checkout_request_id TEXT UNIQUE;
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS establishment_daraja_credentials (
      id                 SERIAL PRIMARY KEY,
      establishment_id   INTEGER UNIQUE NOT NULL
                           REFERENCES establishments(id) ON DELETE CASCADE,
      business_shortcode VARCHAR(20)  NOT NULL,
      consumer_key       TEXT         NULL,     -- AES-256-GCM ciphertext, set via API
      consumer_secret    TEXT         NULL,     -- AES-256-GCM ciphertext, set via API
      passkey            TEXT         NULL,     -- AES-256-GCM ciphertext, set via API
      mpesa_env          VARCHAR(20)  NOT NULL DEFAULT 'sandbox',
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS establishment_daraja_credentials;`);
  pgm.sql(`ALTER TABLE payments DROP COLUMN IF EXISTS mpesa_checkout_request_id;`);
};

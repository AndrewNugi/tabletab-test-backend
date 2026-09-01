exports.up = (pgm) => {
  pgm.sql(`ALTER TYPE discount_target ADD VALUE IF NOT EXISTS 'sub_category';`);
};

exports.down = (_pgm) => {
  // Cannot remove enum values in PostgreSQL without recreating the type
};

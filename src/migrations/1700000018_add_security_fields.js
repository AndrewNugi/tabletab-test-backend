'use strict';
exports.up = (pgm) => {
  pgm.addColumns('users', {
    must_change_password: { type: 'boolean', notNull: true, default: false },
    is_on_shift:          { type: 'boolean', notNull: true, default: false },
  });
  pgm.addColumn('orders', {
    served_by: { type: 'integer', references: '"users"', onDelete: 'SET NULL' },
  });
};
exports.down = (pgm) => {
  pgm.dropColumn('orders', 'served_by');
  pgm.dropColumns('users', ['is_on_shift', 'must_change_password']);
};

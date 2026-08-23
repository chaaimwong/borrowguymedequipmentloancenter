// Fixed column layout for each "collection" when it lives in Google Sheets
// (one tab per collection). Field order here becomes the header row, so a
// staff member opening the spreadsheet sees real, readable columns instead
// of a JSON blob. `types` lists fields that need coercion back to
// number/boolean when read from Sheets (everything else is treated as a
// plain string, which matches how the rest of the app already handles it).
//
// IMPORTANT: keep this in sync with the field names actually written by
// server/routes/*.js and server/lib/borrow.js/audit.js. Adding a brand new
// field to a record there also means adding it here, otherwise sheetsDb.js
// will silently drop it when writing rows.
const SCHEMAS = {
  users: {
    fields: ['user_id', 'username', 'password_hash', 'role', 'name', 'created_at'],
    types: {},
  },
  equipment: {
    fields: ['equipment_id', 'name', 'category', 'total_qty', 'available_qty', 'low_stock_threshold'],
    types: { total_qty: 'number', available_qty: 'number', low_stock_threshold: 'number' },
  },
  borrowers: {
    fields: [
      'borrower_id',
      'first_name',
      'last_name',
      'national_id_enc',
      'address',
      'illness_photo_url',
      'illness_description',
      'id_card_photo_url',
      'registered_at',
      'verified',
      'self_registered',
      'registered_by',
    ],
    types: { verified: 'boolean', self_registered: 'boolean' },
  },
  records: {
    fields: [
      'record_id',
      'borrower_id',
      'equipment_id',
      'borrow_date',
      'due_date',
      'return_date',
      'status',
      'condition_on_return',
      'handled_by',
      'handled_by_name',
      'received_by',
      'received_by_name',
      'source',
    ],
    types: {},
  },
  requests: {
    fields: ['request_id', 'borrower_id', 'equipment_id', 'requested_at', 'status', 'approved_by', 'note', 'record_id'],
    types: {},
  },
  audit_log: {
    fields: ['log_id', 'actor_user_id', 'actor_name', 'action', 'target_type', 'target_id', 'details', 'at'],
    types: {},
  },
};

module.exports = { SCHEMAS };

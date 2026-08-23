// Storage backend dispatcher. Every route/lib file in this project only
// ever talks to `db` and `ensureFile` from here — never to localDb.js or
// sheetsDb.js directly — so switching backends is a pure .env change with
// zero code changes anywhere else.
//
//  - GOOGLE_SHEET_ID set (and STORAGE_BACKEND not forced to "local")
//      -> Google Sheets is the database (sheetsDb.js)
//  - otherwise
//      -> local JSON files under data/ (localDb.js), the original default
//
// STORAGE_BACKEND can be set explicitly to "local" or "sheets" in .env to
// override the auto-detection above (e.g. to force local even if a
// GOOGLE_SHEET_ID is present, while testing).
const backend = process.env.STORAGE_BACKEND
  ? process.env.STORAGE_BACKEND === 'sheets'
  : Boolean(process.env.GOOGLE_SHEET_ID);

module.exports = backend ? require('./sheetsDb') : require('./localDb');

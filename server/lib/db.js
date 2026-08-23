// Storage backend dispatcher. Every route/lib file in this project only
// ever talks to `db` and `ensureFile` from here — never to localDb.js or
// sheetsDb.js directly — so switching backends is a pure .env change with
// zero code changes anywhere else.
//
//  - GOOGLE_SHEET_ID *and* full service-account credentials are present
//    (and STORAGE_BACKEND isn't forced to "local")
//      -> Google Sheets is the database (sheetsDb.js)
//  - otherwise
//      -> local JSON files under data/ (localDb.js), the original default
//
// Auto-detection deliberately requires the *whole* Sheets config to be
// present before switching — e.g. while someone is halfway through the
// README's Google Sheets setup and has only pasted GOOGLE_SHEET_ID so far,
// the app keeps running on local files instead of refusing to start.
// STORAGE_BACKEND can be set explicitly to "local" or "sheets" in .env to
// override this: forcing "sheets" with incomplete credentials fails loudly
// on purpose (useful while debugging that setup), forcing "local" ignores
// any GOOGLE_SHEET_ID present.
function hasSheetsCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return true;
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

const forced = process.env.STORAGE_BACKEND;
const useSheets =
  forced === 'sheets'
    ? true
    : forced === 'local'
    ? false
    : Boolean(process.env.GOOGLE_SHEET_ID) && hasSheetsCredentials();

module.exports = {
  ...(useSheets ? require('./sheetsDb') : require('./localDb')),
  backendName: useSheets ? 'sheets' : 'local',
};

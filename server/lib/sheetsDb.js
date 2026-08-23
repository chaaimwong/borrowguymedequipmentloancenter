// Google Sheets–backed storage backend — a drop-in replacement for
// localDb.js that exposes the exact same { db, ensureFile } interface, so
// none of server/routes/*.js or server/lib/borrow.js/audit.js need to know
// (or care) which backend is actually active. Selected automatically by
// db.js when GOOGLE_SHEET_ID + service-account credentials are present in
// .env — see README "เชื่อมต่อ Google Sheets" for the setup steps.
//
// Each "collection" (borrowers/equipment/records/requests/users/audit_log)
// becomes one worksheet tab in a single spreadsheet, with real columns (not
// a JSON blob) so staff can open the sheet and read it directly.
//
// Trade-offs vs. localDb.js (documented in README):
//  - every read/write is a network call to the Sheets API — slower than a
//    local file, and subject to Google's per-minute quota (fine for a
//    single small organization's traffic, not for high concurrency).
//  - the in-process write queue below prevents two requests *in this same
//    server process* from racing each other, but it can't protect against
//    someone editing the sheet by hand in the Sheets UI at the same instant.
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { SCHEMAS } = require('./collectionSchemas');
const { nextId } = require('./idgen');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function loadCredentials() {
  // Option A: paste the whole service-account JSON key (as downloaded from
  // Google Cloud Console) into one env var, on one line.
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let parsed;
    try {
      parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON ใน .env ไม่ใช่ JSON ที่ถูกต้อง — วางเนื้อหาไฟล์ key ทั้งไฟล์เป็นบรรทัดเดียว'
      );
    }
    return { email: parsed.client_email, key: parsed.private_key };
  }
  // Option B: split email + private key into two env vars.
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      'ตั้งค่า Google Sheets ไม่ครบ: ต้องมี GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY หรือ GOOGLE_SERVICE_ACCOUNT_JSON ใน .env (ดูวิธีตั้งค่าใน README หัวข้อ "เชื่อมต่อ Google Sheets")'
    );
  }
  // .env files can't hold real newlines in a single value, so the private
  // key is usually pasted with literal "\n" — turn those back into real
  // newlines here.
  return { email, key: key.replace(/\\n/g, '\n') };
}

let docPromise = null;
function getDoc() {
  if (!docPromise) {
    if (!SHEET_ID) {
      docPromise = Promise.reject(
        new Error('ตั้งค่า GOOGLE_SHEET_ID ใน .env ก่อนใช้งาน Google Sheets เป็นฐานข้อมูล (ดูวิธีตั้งค่าใน README)')
      );
    } else {
      docPromise = (async () => {
        const { email, key } = loadCredentials();
        const auth = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const doc = new GoogleSpreadsheet(SHEET_ID, auth);
        await doc.loadInfo();
        return doc;
      })();
    }
  }
  return docPromise;
}

function schemaFor(name) {
  const schema = SCHEMAS[name];
  if (!schema) throw new Error(`ไม่รู้จัก collection "${name}" (เพิ่ม schema ใน collectionSchemas.js ก่อน)`);
  return schema;
}

// name -> Promise<GoogleSpreadsheetWorksheet>, cached for the life of the
// process once the tab is confirmed to exist with a valid header row.
const sheetPromises = new Map();

async function getOrCreateSheet(name) {
  if (!sheetPromises.has(name)) {
    sheetPromises.set(
      name,
      (async () => {
        const doc = await getDoc();
        const { fields } = schemaFor(name);
        let sheet = doc.sheetsByTitle[name];
        if (!sheet) {
          sheet = await doc.addSheet({ title: name, headerValues: fields });
        } else {
          try {
            await sheet.loadHeaderRow();
          } catch (e) {
            // Tab exists but has no header row yet (e.g. someone created an
            // empty tab by hand with this exact name) — set ours.
            await sheet.setHeaderRow(fields);
          }
        }
        return sheet;
      })()
    );
  }
  return sheetPromises.get(name);
}

// Sheets returns every cell as a formatted string — convert back to the
// number/boolean types the rest of the app expects.
function coerceIn(name, raw) {
  const { fields, types } = schemaFor(name);
  const out = {};
  fields.forEach((f) => {
    let v = raw[f];
    if (types[f] === 'number') {
      v = v === undefined || v === '' ? 0 : Number(String(v).replace(/,/g, ''));
      if (Number.isNaN(v)) v = 0;
    } else if (types[f] === 'boolean') {
      v = v === true || v === 'true' || v === 'TRUE';
    } else {
      v = v === undefined || v === null ? '' : v;
    }
    out[f] = v;
  });
  return out;
}

// Reverse of coerceIn: plain JS value -> safe cell value for writing.
function coerceOut(name, obj) {
  const { fields, types } = schemaFor(name);
  const row = {};
  fields.forEach((f) => {
    let v = obj[f];
    if (v === undefined || v === null) v = '';
    if (types[f] === 'boolean') v = v ? 'true' : 'false';
    row[f] = v;
  });
  return row;
}

// Per-collection in-process queue — same role as localDb.js's file queue.
const queues = new Map();
function enqueue(name, task) {
  const prev = queues.get(name) || Promise.resolve();
  const next = prev.then(task, task);
  queues.set(name, next.catch(() => {}));
  return next;
}

async function readRows(name) {
  const sheet = await getOrCreateSheet(name);
  const rows = await sheet.getRows();
  return rows.map((r) => coerceIn(name, r.toObject()));
}

async function writeRows(name, data) {
  const sheet = await getOrCreateSheet(name);
  await sheet.clearRows();
  if (data.length) {
    await sheet.addRows(data.map((d) => coerceOut(name, d)));
  }
}

const db = {
  read(name) {
    return enqueue(name, () => readRows(name));
  },
  write(name, data) {
    return enqueue(name, async () => {
      await writeRows(name, data);
      return data;
    });
  },
  // Read-modify-write helper: fn receives current array, returns new array.
  // Reads fresh from Sheets every time (not via db.read, which would
  // deadlock against this same queue) so it always starts from the latest
  // committed state.
  update(name, fn) {
    return enqueue(name, async () => {
      const current = await readRows(name);
      const next = fn(current);
      await writeRows(name, next);
      return next;
    });
  },
  nextId,
};

// Called at boot for every collection — makes sure each tab + header row
// exists, mirroring localDb.js's ensureFile() creating each JSON file.
// `defaultValue` is accepted (for interface parity with localDb.js) but
// unused: a newly created tab always starts empty, same as a new [] file.
async function ensureFile(name, _defaultValue) {
  await getOrCreateSheet(name);
}

module.exports = { db, ensureFile };

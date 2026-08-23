// Simple JSON-file "database" with in-process write queue (per-file mutex)
// so concurrent requests never interleave writes and corrupt a file.
// This is the default storage backend (STORAGE_BACKEND unset / "local").
// See sheetsDb.js for the Google Sheets–backed alternative — both expose
// the exact same { db, ensureFile } interface so routes never know which
// one is active.
const fs = require('fs');
const path = require('path');
const { nextId } = require('./idgen');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const queues = new Map(); // filename -> Promise chain

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

// Returns a Promise (even though this backend is synchronous under the
// hood) so server.js/seed.js can `await` it the same way regardless of
// which storage backend is active.
async function ensureFile(name, defaultValue) {
  const p = filePath(name);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(defaultValue, null, 2), 'utf8');
  }
}

function readRaw(name) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function writeRaw(name, data) {
  const p = filePath(name);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p); // atomic on same filesystem
}

// Queue every read-modify-write against a file so two simultaneous
// requests (e.g. two borrow actions) can't race and clobber each other.
function enqueue(name, task) {
  const prev = queues.get(name) || Promise.resolve();
  const next = prev.then(task, task);
  queues.set(name, next.catch(() => {}));
  return next;
}

const db = {
  read(name) {
    return enqueue(name, async () => readRaw(name));
  },
  write(name, data) {
    return enqueue(name, async () => {
      writeRaw(name, data);
      return data;
    });
  },
  // Read-modify-write helper: fn receives current array, returns new array
  update(name, fn) {
    return enqueue(name, async () => {
      const current = readRaw(name);
      const next = fn(current);
      writeRaw(name, next);
      return next;
    });
  },
  nextId,
};

module.exports = { db, ensureFile, DATA_DIR };

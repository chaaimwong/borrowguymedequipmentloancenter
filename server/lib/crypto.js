// AES-256-GCM encryption for sensitive fields at rest (national ID numbers).
// Key comes from env var ENCRYPTION_KEY (32-byte, base64). If missing, a key
// is generated on first run and written to data/.encryption_key so the app
// still works out of the box — but for real deployments set ENCRYPTION_KEY
// yourself (e.g. in a real secrets manager) and do NOT commit the key file.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', '..', 'data', '.encryption_key');

function loadOrCreateKey() {
  if (process.env.ENCRYPTION_KEY) {
    return Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
  }
  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, key.toString('base64'), 'utf8');
  return key;
}

const KEY = loadOrCreateKey();

function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(payload) {
  if (!payload) return '';
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return payload; // not encrypted (legacy/plain)
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    return '';
  }
}

// Masked display version e.g. 1-2345-xxxxx-67-8 style simplified: show first3+last4
function mask(nationalId) {
  if (!nationalId || nationalId.length < 7) return '•••••••••••••';
  return `${nationalId.slice(0, 3)}xxxxxxx${nationalId.slice(-3)}`;
}

module.exports = { encrypt, decrypt, mask };

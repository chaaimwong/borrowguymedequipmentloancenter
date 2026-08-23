require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { ensureFile } = require('./lib/db');
const { requireAuth } = require('./middleware/auth');
const { UPLOAD_ROOT } = require('./lib/upload');

const authRoutes = require('./routes/auth');
const borrowerRoutes = require('./routes/borrowers');
const equipmentRoutes = require('./routes/equipment');
const recordRoutes = require('./routes/records');
const requestRoutes = require('./routes/requests');
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3000;
const usingSheets = process.env.STORAGE_BACKEND ? process.env.STORAGE_BACKEND === 'sheets' : Boolean(process.env.GOOGLE_SHEET_ID);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: 'medequip.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me-in-.env',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === '1',
    },
  })
);

// Uploaded photos are PII / health data — only logged-in staff can view them.
app.use('/uploads', requireAuth, express.static(UPLOAD_ROOT));

app.use('/api/auth', authRoutes);
app.use('/api/borrowers', borrowerRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/audit-log', auditRoutes);

// Frontend (static, public — no PII lives in these files)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Basic error handler so a thrown error returns JSON instead of hanging/crashing.
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.message && err.message.includes('รองรับเฉพาะไฟล์รูปภาพ')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ (server error)' });
});

async function start() {
  // Make sure every collection's storage exists before serving requests —
  // a JSON file per collection for the local backend, a sheet tab (with
  // header row) per collection for the Google Sheets backend.
  try {
    await Promise.all(
      ['borrowers', 'equipment', 'records', 'requests', 'users', 'audit_log'].map((f) => ensureFile(f, []))
    );
  } catch (e) {
    console.error('ไม่สามารถเตรียมฐานข้อมูลได้ตอนเริ่มระบบ:', e.message);
    if (usingSheets) {
      console.error('ตรวจสอบ GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY ใน .env และตรวจว่าได้แชร์ชีตให้ service account เป็น Editor แล้ว (ดู README)');
    }
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`ระบบยืม-คืนกายอุปกรณ์การแพทย์ กำลังทำงานที่ http://localhost:${PORT}`);
    console.log(`โหมดจัดเก็บข้อมูล: ${usingSheets ? 'Google Sheets' : 'ไฟล์ JSON local (data/)'}`);
  });
}

start();

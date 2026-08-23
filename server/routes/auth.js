const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../lib/db');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }
  const users = await db.read('users');
  const user = users.find((u) => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  req.session.user = { user_id: user.user_id, username: user.username, role: user.role, name: user.name };
  await logAction({ actor: req.session.user, action: 'login', targetType: 'user', targetId: user.user_id });
  res.json({ user: req.session.user });
});

router.post('/logout', async (req, res) => {
  const user = req.session.user;
  if (user) await logAction({ actor: user, action: 'logout', targetType: 'user', targetId: user.user_id });
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;

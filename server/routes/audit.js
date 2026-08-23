const express = require('express');
const { db } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const log = await db.read('audit_log');
  let list = [...log].sort((a, b) => new Date(b.at) - new Date(a.at));
  const { target_type, target_id, actor_user_id, limit } = req.query;
  if (target_type) list = list.filter((l) => l.target_type === target_type);
  if (target_id) list = list.filter((l) => l.target_id === target_id);
  if (actor_user_id) list = list.filter((l) => l.actor_user_id === actor_user_id);
  if (limit) list = list.slice(0, parseInt(limit, 10));
  res.json({ audit_log: list });
});

module.exports = router;

const express = require('express');
const { db } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { issueBorrow, returnBorrow, displayStatus, BorrowError } = require('../lib/borrow');

const router = express.Router();

function enrich(r, borrowersById, equipmentById) {
  const b = borrowersById[r.borrower_id];
  const e = equipmentById[r.equipment_id];
  return {
    ...r,
    status: displayStatus(r),
    borrower_name: b ? `${b.first_name} ${b.last_name}` : r.borrower_id,
    equipment_name: e ? e.name : r.equipment_id,
  };
}

async function lookups() {
  const [borrowers, equipment] = await Promise.all([db.read('borrowers'), db.read('equipment')]);
  const borrowersById = Object.fromEntries(borrowers.map((b) => [b.borrower_id, b]));
  const equipmentById = Object.fromEntries(equipment.map((e) => [e.equipment_id, e]));
  return { borrowersById, equipmentById };
}

// List / filter records (history views use this too via query params).
router.get('/', requireAuth, async (req, res) => {
  const records = await db.read('records');
  const { borrower_id, equipment_id, status } = req.query;
  const { borrowersById, equipmentById } = await lookups();
  let list = records.map((r) => enrich(r, borrowersById, equipmentById));
  if (borrower_id) list = list.filter((r) => r.borrower_id === borrower_id);
  if (equipment_id) list = list.filter((r) => r.equipment_id === equipment_id);
  if (status) list = list.filter((r) => r.status === status);
  list.sort((a, b) => new Date(b.borrow_date) - new Date(a.borrow_date));
  res.json({ records: list });
});

router.post('/', requireAuth, async (req, res) => {
  const { borrower_id, equipment_id, due_date } = req.body || {};
  if (!borrower_id || !equipment_id) {
    return res.status(400).json({ error: 'กรุณาเลือกผู้ยืมและอุปกรณ์' });
  }
  try {
    const record = await issueBorrow({ borrower_id, equipment_id, due_date, handled_by: req.session.user, source: 'direct' });
    const { borrowersById, equipmentById } = await lookups();
    res.status(201).json({ record: enrich(record, borrowersById, equipmentById) });
  } catch (e) {
    if (e instanceof BorrowError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

router.put('/:id/return', requireAuth, async (req, res) => {
  const { condition_on_return } = req.body || {};
  try {
    const record = await returnBorrow({ record_id: req.params.id, received_by: req.session.user, condition_on_return });
    const { borrowersById, equipmentById } = await lookups();
    res.json({ record: enrich(record, borrowersById, equipmentById) });
  } catch (e) {
    if (e instanceof BorrowError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

module.exports = router;

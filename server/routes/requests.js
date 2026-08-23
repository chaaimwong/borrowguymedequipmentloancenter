const express = require('express');
const { db } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { encrypt, decrypt, mask } = require('../lib/crypto');
const { isValidThaiNationalId } = require('../lib/validate');
const { illnessPhotoUpload } = require('../lib/upload');
const { issueBorrow, BorrowError } = require('../lib/borrow');
const { logAction } = require('../lib/audit');

const router = express.Router();

function reqView(r, borrowersById, equipmentById) {
  const b = borrowersById[r.borrower_id];
  const e = equipmentById[r.equipment_id];
  return {
    ...r,
    borrower_name: b ? `${b.first_name} ${b.last_name}` : r.borrower_id,
    equipment_name: e ? e.name : r.equipment_id,
  };
}

async function lookups() {
  const [borrowers, equipment] = await Promise.all([db.read('borrowers'), db.read('equipment')]);
  return {
    borrowersById: Object.fromEntries(borrowers.map((b) => [b.borrower_id, b])),
    equipmentById: Object.fromEntries(equipment.map((e) => [e.equipment_id, e])),
  };
}

// PUBLIC: submit a borrow request. No login needed (spec 4.3). If the
// national ID already exists in borrowers, we reuse that record instead of
// creating a duplicate; otherwise we self-register a (unverified) borrower.
router.post('/', illnessPhotoUpload.single('illness_photo'), async (req, res) => {
  const { first_name, last_name, national_id, address, illness_description, equipment_id } = req.body || {};
  if (!first_name || !last_name || !national_id || !address || !equipment_id) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (ชื่อ, นามสกุล, เลขบัตรประชาชน, ที่อยู่, อุปกรณ์ที่ต้องการ)' });
  }
  if (!isValidThaiNationalId(national_id)) {
    return res.status(400).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลัก)' });
  }
  const equipment = await db.read('equipment');
  if (!equipment.find((e) => e.equipment_id === equipment_id)) {
    return res.status(404).json({ error: 'ไม่พบอุปกรณ์ที่เลือก' });
  }

  const borrowers = await db.read('borrowers');
  let borrower = borrowers.find((b) => decrypt(b.national_id_enc) === national_id);

  if (!borrower) {
    const updatedList = await db.update('borrowers', (list) => {
      const rec = {
        borrower_id: db.nextId(list, 'B'),
        first_name,
        last_name,
        national_id_enc: encrypt(national_id),
        address,
        illness_photo_url: req.file ? `/uploads/illness_photos/${req.file.filename}` : '',
        illness_description: illness_description || '',
        id_card_photo_url: '',
        registered_at: new Date().toISOString(),
        verified: false,
        self_registered: true,
        registered_by: null,
      };
      list.push(rec);
      return list;
    });
    borrower = updatedList[updatedList.length - 1];
    await logAction({ actor: null, action: 'self_register_borrower', targetType: 'borrower', targetId: borrower.borrower_id });
  } else if (req.file) {
    // Update illness photo if a new one was attached to this request.
    await db.update('borrowers', (list) => {
      const idx = list.findIndex((b) => b.borrower_id === borrower.borrower_id);
      if (idx !== -1) list[idx] = { ...list[idx], illness_photo_url: `/uploads/illness_photos/${req.file.filename}` };
      return list;
    });
  }

  const list = await db.update('requests', (cur) => {
    const rec = {
      request_id: db.nextId(cur, 'Q'),
      borrower_id: borrower.borrower_id,
      equipment_id,
      requested_at: new Date().toISOString(),
      status: 'รอดำเนินการ',
      approved_by: null,
      note: illness_description || '',
    };
    cur.push(rec);
    return cur;
  });
  const created = list[list.length - 1];
  await logAction({ actor: null, action: 'submit_request', targetType: 'request', targetId: created.request_id });

  const { borrowersById, equipmentById } = await lookups();
  res.status(201).json({ request: reqView(created, borrowersById, equipmentById), borrower_id: borrower.borrower_id });
});

// STAFF: list all requests (queue), optional ?status= filter.
router.get('/', requireAuth, async (req, res) => {
  const requests = await db.read('requests');
  const { borrowersById, equipmentById } = await lookups();
  let list = requests.map((r) => reqView(r, borrowersById, equipmentById));
  if (req.query.status) list = list.filter((r) => r.status === req.query.status);
  list.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  res.json({ requests: list });
});

// STAFF: approve -> converts into a real borrow record (4.2).
router.put('/:id/approve', requireAuth, async (req, res) => {
  const { due_date } = req.body || {};
  const requests = await db.read('requests');
  const idx = requests.findIndex((r) => r.request_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบคำขอ' });
  if (requests[idx].status !== 'รอดำเนินการ') return res.status(409).json({ error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });

  try {
    const record = await issueBorrow({
      borrower_id: requests[idx].borrower_id,
      equipment_id: requests[idx].equipment_id,
      due_date,
      handled_by: req.session.user,
      source: 'request',
    });
    const updatedList = await db.update('requests', (cur) => {
      const i = cur.findIndex((r) => r.request_id === req.params.id);
      if (i !== -1) cur[i] = { ...cur[i], status: 'อนุมัติ', approved_by: req.session.user.user_id, record_id: record.record_id };
      return cur;
    });
    await logAction({ actor: req.session.user, action: 'approve_request', targetType: 'request', targetId: req.params.id, details: `record=${record.record_id}` });
    const { borrowersById, equipmentById } = await lookups();
    const updated = updatedList.find((r) => r.request_id === req.params.id);
    res.json({ request: reqView(updated, borrowersById, equipmentById), record });
  } catch (e) {
    if (e instanceof BorrowError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

router.put('/:id/reject', requireAuth, async (req, res) => {
  const { reason } = req.body || {};
  const existing = await db.read('requests');
  if (!existing.find((r) => r.request_id === req.params.id)) {
    return res.status(404).json({ error: 'ไม่พบคำขอ' });
  }
  try {
    const updatedList = await db.update('requests', (cur) => {
      const i = cur.findIndex((r) => r.request_id === req.params.id);
      if (i === -1) throw new BorrowError('ไม่พบคำขอ', 404);
      if (cur[i].status !== 'รอดำเนินการ') throw new BorrowError('คำขอนี้ถูกดำเนินการไปแล้ว', 409);
      cur[i] = { ...cur[i], status: 'ปฏิเสธ', approved_by: req.session.user.user_id, note: reason || cur[i].note };
      return cur;
    });
    const updated = updatedList.find((r) => r.request_id === req.params.id);
    await logAction({ actor: req.session.user, action: 'reject_request', targetType: 'request', targetId: req.params.id, details: reason || '' });
    const { borrowersById, equipmentById } = await lookups();
    res.json({ request: reqView(updated, borrowersById, equipmentById) });
  } catch (e) {
    if (e instanceof BorrowError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

module.exports = router;

const express = require('express');
const { db } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { encrypt, decrypt, mask } = require('../lib/crypto');
const { isValidThaiNationalId } = require('../lib/validate');
const { idCardUpload, illnessPhotoUpload } = require('../lib/upload');
const { logAction } = require('../lib/audit');

const router = express.Router();

function toListView(b) {
  return {
    borrower_id: b.borrower_id,
    first_name: b.first_name,
    last_name: b.last_name,
    national_id_masked: mask(decrypt(b.national_id_enc)),
    address: b.address,
    registered_at: b.registered_at,
    verified: !!b.verified,
    self_registered: !!b.self_registered,
  };
}

function toFullView(b) {
  return {
    ...toListView(b),
    national_id: decrypt(b.national_id_enc),
    illness_photo_url: b.illness_photo_url || '',
    illness_description: b.illness_description || '',
    id_card_photo_url: b.id_card_photo_url || '',
  };
}

// List / search borrowers (staff only). ?q= matches name or national id.
router.get('/', requireAuth, async (req, res) => {
  const borrowers = await db.read('borrowers');
  const q = (req.query.q || '').trim();
  let list = borrowers;
  if (q) {
    list = borrowers.filter((b) => {
      const fullName = `${b.first_name} ${b.last_name}`.toLowerCase();
      const nid = decrypt(b.national_id_enc);
      return fullName.includes(q.toLowerCase()) || nid.includes(q);
    });
  }
  res.json({ borrowers: list.map(toListView) });
});

router.get('/:id', requireAuth, async (req, res) => {
  const borrowers = await db.read('borrowers');
  const b = borrowers.find((x) => x.borrower_id === req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ยืม' });
  res.json({ borrower: toFullView(b) });
});

// Staff-side full registration, with ID card + illness photo uploads.
router.post(
  '/',
  requireAuth,
  idCardUpload.single('id_card_photo'),
  async (req, res) => {
    const { first_name, last_name, national_id, address, illness_description } = req.body || {};
    if (!first_name || !last_name || !national_id || !address) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (ชื่อ, นามสกุล, เลขบัตรประชาชน, ที่อยู่)' });
    }
    if (!isValidThaiNationalId(national_id)) {
      return res.status(400).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักและผ่านการตรวจสอบ checksum)' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาแนบรูปบัตรประชาชนเพื่อยืนยันตัวตน' });
    }
    const borrower = await db.update('borrowers', (list) => {
      const rec = {
        borrower_id: db.nextId(list, 'B'),
        first_name,
        last_name,
        national_id_enc: encrypt(national_id),
        address,
        illness_photo_url: '',
        illness_description: illness_description || '',
        id_card_photo_url: `/uploads/id_cards/${req.file.filename}`,
        registered_at: new Date().toISOString(),
        verified: true,
        self_registered: false,
        registered_by: req.session.user.user_id,
      };
      list.push(rec);
      return list;
    }).then((list) => list[list.length - 1]);

    await logAction({ actor: req.session.user, action: 'register_borrower', targetType: 'borrower', targetId: borrower.borrower_id });
    res.status(201).json({ borrower: toFullView(borrower) });
  }
);

// Attach / replace illness photo separately (also usable by public flow via requests.js)
router.post('/:id/illness-photo', requireAuth, illnessPhotoUpload.single('illness_photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });
  const updated = await db.update('borrowers', (list) => {
    const idx = list.findIndex((b) => b.borrower_id === req.params.id);
    if (idx === -1) return list;
    list[idx] = { ...list[idx], illness_photo_url: `/uploads/illness_photos/${req.file.filename}` };
    return list;
  });
  const b = updated.find((x) => x.borrower_id === req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ยืม' });
  res.json({ borrower: toFullView(b) });
});

module.exports = router;

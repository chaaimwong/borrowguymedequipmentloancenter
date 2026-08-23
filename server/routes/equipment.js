const express = require('express');
const { db } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAction } = require('../lib/audit');

const router = express.Router();

function withFlags(e) {
  return {
    ...e,
    borrowed_qty: e.total_qty - e.available_qty,
    low_stock: e.available_qty <= (e.low_stock_threshold ?? 0),
  };
}

// Equipment list is needed by the public request form too, so this stays open.
router.get('/', async (req, res) => {
  const equipment = await db.read('equipment');
  res.json({ equipment: equipment.map(withFlags) });
});

router.get('/:id', async (req, res) => {
  const equipment = await db.read('equipment');
  const e = equipment.find((x) => x.equipment_id === req.params.id);
  if (!e) return res.status(404).json({ error: 'ไม่พบอุปกรณ์' });
  res.json({ equipment: withFlags(e) });
});

// Only admin manages the equipment catalog (add new items / change totals).
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, category, total_qty, low_stock_threshold } = req.body || {};
  if (!name || !total_qty) return res.status(400).json({ error: 'กรุณากรอกชื่ออุปกรณ์และจำนวนทั้งหมด' });
  const qty = parseInt(total_qty, 10);
  if (Number.isNaN(qty) || qty < 0) return res.status(400).json({ error: 'จำนวนไม่ถูกต้อง' });

  const list = await db.update('equipment', (cur) => {
    const rec = {
      equipment_id: db.nextId(cur, 'E'),
      name,
      category: category || '',
      total_qty: qty,
      available_qty: qty,
      low_stock_threshold: low_stock_threshold ? parseInt(low_stock_threshold, 10) : 2,
    };
    cur.push(rec);
    return cur;
  });
  const created = list[list.length - 1];
  await logAction({ actor: req.session.user, action: 'create_equipment', targetType: 'equipment', targetId: created.equipment_id });
  res.status(201).json({ equipment: withFlags(created) });
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const { name, category, total_qty, low_stock_threshold } = req.body || {};
  let updatedRec = null;
  const list = await db.update('equipment', (cur) => {
    const idx = cur.findIndex((e) => e.equipment_id === req.params.id);
    if (idx === -1) return cur;
    const e = cur[idx];
    let newTotal = e.total_qty;
    let newAvailable = e.available_qty;
    if (total_qty !== undefined) {
      const qty = parseInt(total_qty, 10);
      if (!Number.isNaN(qty) && qty >= 0) {
        const diff = qty - e.total_qty;
        newTotal = qty;
        newAvailable = Math.max(0, e.available_qty + diff); // keep borrowed count consistent
      }
    }
    cur[idx] = {
      ...e,
      name: name ?? e.name,
      category: category ?? e.category,
      total_qty: newTotal,
      available_qty: newAvailable,
      low_stock_threshold: low_stock_threshold !== undefined ? parseInt(low_stock_threshold, 10) : e.low_stock_threshold,
    };
    updatedRec = cur[idx];
    return cur;
  });
  if (!updatedRec) return res.status(404).json({ error: 'ไม่พบอุปกรณ์' });
  await logAction({ actor: req.session.user, action: 'update_equipment', targetType: 'equipment', targetId: req.params.id });
  res.json({ equipment: withFlags(updatedRec) });
});

module.exports = router;

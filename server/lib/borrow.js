// Shared borrow/return logic used both by the staff-direct borrow flow
// (records.js) and by approving a public request (requests.js), so stock
// counts and audit trail stay consistent no matter which path created them.
const { db } = require('./db');
const { logAction } = require('./audit');

class BorrowError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function issueBorrow({ borrower_id, equipment_id, due_date, handled_by, source }) {
  const borrowers = await db.read('borrowers');
  if (!borrowers.find((b) => b.borrower_id === borrower_id)) {
    throw new BorrowError('ไม่พบข้อมูลผู้ยืม', 404);
  }

  let createdRecord = null;
  await db.update('equipment', (eq) => {
    const idx = eq.findIndex((e) => e.equipment_id === equipment_id);
    if (idx === -1) throw new BorrowError('ไม่พบอุปกรณ์', 404);
    if (eq[idx].available_qty <= 0) throw new BorrowError('อุปกรณ์นี้ถูกยืมหมดแล้ว ไม่สามารถยืมได้', 409);
    eq[idx] = { ...eq[idx], available_qty: eq[idx].available_qty - 1 };
    return eq;
  });

  const records = await db.update('records', (list) => {
    const rec = {
      record_id: db.nextId(list, 'R'),
      borrower_id,
      equipment_id,
      borrow_date: new Date().toISOString(),
      due_date: due_date || null,
      return_date: null,
      status: 'ยืมอยู่',
      condition_on_return: '',
      handled_by: handled_by.user_id,
      handled_by_name: handled_by.name,
      received_by: '',
      received_by_name: '',
      source: source || 'direct',
    };
    list.push(rec);
    createdRecord = rec;
    return list;
  });

  await logAction({
    actor: handled_by,
    action: 'borrow',
    targetType: 'record',
    targetId: createdRecord.record_id,
    details: `equipment=${equipment_id} borrower=${borrower_id}`,
  });

  return createdRecord;
}

async function returnBorrow({ record_id, received_by, condition_on_return }) {
  let updated = null;
  await db.update('records', (list) => {
    const idx = list.findIndex((r) => r.record_id === record_id);
    if (idx === -1) throw new BorrowError('ไม่พบรายการยืม', 404);
    if (list[idx].status === 'คืนแล้ว') throw new BorrowError('รายการนี้คืนแล้ว', 409);
    list[idx] = {
      ...list[idx],
      return_date: new Date().toISOString(),
      status: 'คืนแล้ว',
      condition_on_return: condition_on_return || '',
      received_by: received_by ? received_by.user_id : '',
      received_by_name: received_by ? received_by.name : '',
    };
    updated = list[idx];
    return list;
  });

  await db.update('equipment', (eq) => {
    const idx = eq.findIndex((e) => e.equipment_id === updated.equipment_id);
    if (idx !== -1) {
      eq[idx] = { ...eq[idx], available_qty: Math.min(eq[idx].total_qty, eq[idx].available_qty + 1) };
    }
    return eq;
  });

  await logAction({
    actor: received_by,
    action: 'return',
    targetType: 'record',
    targetId: record_id,
    details: `equipment=${updated.equipment_id} borrower=${updated.borrower_id}`,
  });

  return updated;
}

// Derive display status (adds "เกินกำหนด" for active-but-overdue) without
// mutating stored status, so history/reporting can recompute anytime.
function displayStatus(record) {
  if (record.status === 'คืนแล้ว') return 'คืนแล้ว';
  if (record.due_date && new Date(record.due_date) < new Date()) return 'เกินกำหนด';
  return 'ยืมอยู่';
}

module.exports = { issueBorrow, returnBorrow, displayStatus, BorrowError };

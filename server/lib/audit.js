const { db } = require('./db');

// Every borrow/return/approve/reject/register action gets logged here with
// who did it, so 4.5 (audit log) has a full trail independent of the
// individual record's own handled_by/approved_by field.
async function logAction({ actor, action, targetType, targetId, details }) {
  await db.update('audit_log', (list) => {
    const entry = {
      log_id: db.nextId(list, 'L'),
      actor_user_id: actor ? actor.user_id : 'public',
      actor_name: actor ? actor.name : 'ผู้ใช้ทั่วไป (ไม่ login)',
      action,
      target_type: targetType,
      target_id: targetId,
      details: details || '',
      at: new Date().toISOString(),
    };
    return [...list, entry];
  });
}

module.exports = { logAction };

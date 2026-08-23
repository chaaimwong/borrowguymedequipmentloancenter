// Seeds initial data files if they don't already exist / are empty.
// Safe to run multiple times.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, ensureFile } = require('./lib/db');

async function seed() {
  await Promise.all(
    ['borrowers', 'equipment', 'records', 'requests', 'users', 'audit_log'].map((f) => ensureFile(f, []))
  );

  const users = await db.read('users');
  if (users.length === 0) {
    const adminPass = process.env.SEED_ADMIN_PASSWORD || 'admin1234';
    const staffPass = process.env.SEED_STAFF_PASSWORD || 'staff1234';
    const newUsers = [
      {
        user_id: 'U0001',
        username: 'admin',
        password_hash: bcrypt.hashSync(adminPass, 10),
        role: 'admin',
        name: 'ผู้ดูแลระบบ',
        created_at: new Date().toISOString(),
      },
      {
        user_id: 'U0002',
        username: 'staff',
        password_hash: bcrypt.hashSync(staffPass, 10),
        role: 'staff',
        name: 'เจ้าหน้าที่ตัวอย่าง',
        created_at: new Date().toISOString(),
      },
    ];
    await db.write('users', newUsers);
    console.log('Seeded users: admin/' + adminPass + '  staff/' + staffPass);
    console.log('*** เปลี่ยนรหัสผ่านทันทีหลังใช้งานจริง / change these passwords immediately ***');
  }

  const equipment = await db.read('equipment');
  if (equipment.length === 0) {
    const sample = [
      { equipment_id: 'E0001', name: 'วีลแชร์ (Wheelchair)', category: 'เคลื่อนที่', total_qty: 10, available_qty: 10, low_stock_threshold: 2 },
      { equipment_id: 'E0002', name: 'ไม้ค้ำยัน (Crutches)', category: 'เคลื่อนที่', total_qty: 20, available_qty: 20, low_stock_threshold: 4 },
      { equipment_id: 'E0003', name: 'เตียงผู้ป่วยไฟฟ้า (Electric Bed)', category: 'เตียง/ที่นอน', total_qty: 5, available_qty: 5, low_stock_threshold: 1 },
      { equipment_id: 'E0004', name: 'เครื่องผลิตออกซิเจน (Oxygen Concentrator)', category: 'ระบบหายใจ', total_qty: 6, available_qty: 6, low_stock_threshold: 2 },
      { equipment_id: 'E0005', name: 'walker (โครงเหล็กช่วยเดิน)', category: 'เคลื่อนที่', total_qty: 15, available_qty: 15, low_stock_threshold: 3 },
    ];
    await db.write('equipment', sample);
    console.log('Seeded sample equipment (' + sample.length + ' items)');
  }

  console.log('Seed complete.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

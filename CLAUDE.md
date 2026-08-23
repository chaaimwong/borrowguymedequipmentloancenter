# CLAUDE.md

คำแนะนำสำหรับ Claude Code (หรือ Claude ตัวไหนก็ตาม) เมื่อทำงานต่อในโปรเจกต์นี้

## โปรเจกต์นี้คืออะไร

ระบบยืม-คืนกายอุปกรณ์การแพทย์ — เว็บแอป Node.js/Express แบบ full-stack เก็บข้อมูลได้ 2 แบบ: ไฟล์ JSON local (ค่าเริ่มต้น) หรือ Google Sheets (ตั้งค่าผ่าน `.env`, ดูหัวข้อ "เชื่อมต่อ Google Sheets" ใน README) อ่านรายละเอียดฟีเจอร์ครบถ้วนได้ที่ `README.md` และวิธี deploy ที่ `DEPLOY.md`

## สถาปัตยกรรม

- **Backend**: `server/server.js` (entrypoint) → `server/routes/*.js` (REST API แยกตามโมดูล: auth, borrowers, equipment, records, requests, audit) → `server/lib/*.js` (db.js เป็น dispatcher เลือก backend อัตโนมัติจาก env: `localDb.js` = ไฟล์ JSON แบบมี queue กันเขียนชนกัน, `sheetsDb.js` = Google Sheets ผ่าน service account — ทั้งสองไฟล์ implement หน้าตา `{ db: {read,write,update,nextId}, ensureFile }` เดียวกันทุกประการ โดยอ้างอิง column layout จาก `collectionSchemas.js` และ id generator ร่วมจาก `idgen.js`, เพื่อให้ route ทุกไฟล์เรียก `require('./lib/db')` เดียว ไม่ต้องรู้ว่า backend ไหนกำลังทำงานอยู่, crypto.js เข้ารหัส AES-256-GCM สำหรับเลขบัตร ปชช., borrow.js คือ business logic กลางของการยืม/คืนที่ทั้ง records.js และ requests.js เรียกใช้ร่วมกัน)
- **Frontend**: vanilla JS ล้วน ไม่มี build step — `public/index.html` (หน้าแรกสาธารณะ), `public/request.html` + `js/request.js` (ฟอร์มคำขอสาธารณะ), `public/staff.html` + `js/app.js` (แอปเจ้าหน้าที่ SPA แบบ tab-based, ไม่มี router library, สลับหน้าจอด้วย `switchTab()`)
- **ธีม**: สีส้ม `#FF6C1D` ตาม design tokens ใน `public/css/style.css` (CSS variables ที่ `:root`) ฟอนต์ Kanit (หัวข้อ) + Noto Sans Thai (เนื้อหา) จาก Google Fonts ไอคอนใช้ inline SVG (feather-icons style) ไม่ใช้ emoji หรือ icon library ภายนอก

## กติกาเมื่อแก้ไข/เพิ่มฟีเจอร์

- ข้อมูล PII (เลขบัตรประชาชน) ต้องเข้ารหัสก่อนเขียนลง JSON เสมอ — ใช้ `encrypt()`/`decrypt()` จาก `server/lib/crypto.js` อย่าเก็บ plain text
- ทุก endpoint ที่แตะข้อมูลผู้ยืม/รูปภาพ ต้องมี `requireAuth` หรือ `requireRole()` จาก `server/middleware/auth.js`
- ทุกการกระทำที่มีผลต่อข้อมูล (ยืม/คืน/อนุมัติ/ปฏิเสธ/ลงทะเบียน) ต้องเรียก `logAction()` จาก `server/lib/audit.js` เพื่อให้ audit log สมบูรณ์
- การอ่าน/เขียนข้อมูลต้องผ่าน `db.read()`/`db.update()`/`db.write()` จาก `server/lib/db.js` เท่านั้น (ห้าม `fs.writeFileSync` หรือเรียก Google Sheets API ตรง ๆ ใน route) เพราะมันคิว write กันข้อมูลชนกัน และทำให้โค้ดใช้ได้กับทั้งสอง backend โดยไม่ต้องแยก if/else
- ถ้าเพิ่มฟิลด์ใหม่ในข้อมูล collection ไหน (borrowers/equipment/records/requests/users/audit_log) ต้องเพิ่มชื่อฟิลด์นั้นใน `server/lib/collectionSchemas.js` ด้วยเสมอ ไม่งั้น `sheetsDb.js` จะเงียบ ๆ ตัดฟิลด์นั้นทิ้งตอนเขียนลง Google Sheets (โหมดไฟล์ local ไม่ได้รับผลกระทบเพราะเก็บทั้ง object)
- ฟอนต์/สี ให้ใช้ CSS variables ที่มีอยู่แล้วใน `:root` ของ `style.css` อย่า hardcode สีส้มใหม่กระจัดกระจาย
- ทดสอบด้วย `node --check` กับไฟล์ JS ฝั่ง client ก่อน commit เสมอ (ไม่มี build/test suite อัตโนมัติในโปรเจกต์นี้ — ทดสอบ manual ผ่าน curl/Playwright screenshot ถ้าเป็นไปได้)

## คำสั่งที่ใช้บ่อย

```bash
npm install
npm run seed      # รีเซ็ต/สร้างข้อมูลเริ่มต้น (ผู้ใช้ + อุปกรณ์ตัวอย่าง)
npm start         # รันที่ http://localhost:3000
```

## สิ่งที่ยังไม่ได้ทำ (โอกาสพัฒนาต่อ)

- ยังไม่มีหน้าจอจัดการผู้ใช้ (เพิ่ม/ลบ/รีเซ็ตรหัสผ่านเจ้าหน้าที่) — ตอนนี้ต้องรันสคริปต์เอง (ดู README หัวข้อ "การจัดการผู้ใช้")
- ยังไม่มี data retention / auto-delete policy ตาม PDPA
- ยังไม่รองรับหลายภาษา (UI เป็นภาษาไทยล้วน)
- ยังไม่มี automated test suite
- Deploy เป้าหมายคือ VPS เดี่ยว (persistent disk) — ยังไม่ได้ออกแบบให้รองรับ multi-instance/horizontal scaling เพราะ storage เป็นไฟล์ JSON บนดิสก์เครื่องเดียว

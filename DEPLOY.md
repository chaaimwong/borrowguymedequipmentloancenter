# คู่มือ Deploy ขึ้น URL จริง (เซิร์ฟเวอร์ในประเทศไทย)

## สรุปสั้น ๆ ก่อน

เนื่องจากระบบนี้เก็บข้อมูลเป็นไฟล์ JSON + รูปภาพบน disk (ไม่ใช่ฐานข้อมูลระบบคลาวด์) และคุณต้องการให้ข้อมูลอยู่ในประเทศไทย (PDPA/นโยบายองค์กร) จึงมี 2 ทางเลือกหลัก — **ทั้งสองทางต้องใช้ VPS ที่ต่อผ่าน SSH เอง** เพราะแพลตฟอร์ม "deploy ง่ายผ่าน dashboard แบบ git push" อย่าง Railway/Render/Vercel ยังไม่มีศูนย์ข้อมูลในไทย ผมทำสคริปต์ให้พร้อมรันแบบ copy-paste เพื่อให้ขั้นตอน SSH สั้นและง่ายที่สุดเท่าที่จะทำได้

| | **ตัวเลือก A: Z.com Cloud (Thai VPS)** | **ตัวเลือก B: AWS Bangkok Region** |
|---|---|---|
| ที่ตั้งเซิร์ฟเวอร์ | ในไทย (ผู้ให้บริการไทย) | ในไทย (`ap-southeast-7`, เปิดใช้งานปี 2025) |
| ราคาเริ่มต้น | ~400 บาท/เดือน | ~ใกล้เคียงกัน แต่จ่ายตามการใช้งานจริง (pay-as-you-go) |
| ความง่าย | ง่ายกว่า สมัครเร็ว จ่ายผ่านบัตร/พร้อมเพย์ไทยได้ | ต้องผูกบัตรเครดิตต่างประเทศ, dashboard ซับซ้อนกว่าเล็กน้อย |
| เหมาะกับ | องค์กรเล็ก/มูลนิธิ งบจำกัด ต้องการง่ายที่สุด | ต้องการความน่าเชื่อถือระดับ enterprise, สเกลได้ในอนาคต |

ทั้งสองแบบ **ขั้นตอนติดตั้งแอปในเครื่องเหมือนกันทุกประการ** (เป็น Ubuntu Linux เหมือนกัน) ต่างกันแค่ตอนสร้างเครื่องเท่านั้น คู่มือนี้จึงเขียนขั้นตอนเดียวใช้ได้กับทั้งสองทาง

ผู้ให้บริการไทยรายอื่นที่ใช้แทน Z.com ได้เช่นกัน (โครงสร้างคล้ายกัน): thaidata.cloud, CAT/NT Cloud, True IDC — เหมาะกับองค์กรที่ต้องการทำสัญญา/ใบกำกับภาษีแบบนิติบุคคลไทยโดยตรง

## ขั้นตอนที่ 1: สร้างเครื่อง VPS

**ตัวเลือก A (Z.com Cloud):**
1. สมัครที่ [cloud.z.com/th](https://cloud.z.com/th/en/vps/)
2. สร้าง instance ใหม่ เลือก OS = **Ubuntu 22.04**, สเปกแนะนำเริ่มต้น 1 vCPU / 2GB RAM ก็เพียงพอสำหรับองค์กรเล็ก (ปรับเพิ่มได้ภายหลัง)
3. ตั้งรหัสผ่าน root หรืออัปโหลด SSH key แล้วบันทึก IP address ที่ได้

**ตัวเลือก B (AWS Bangkok):**
1. เข้า AWS Console → เลือก region **Asia Pacific (Thailand) ap-southeast-7** ที่มุมขวาบน
2. EC2 → Launch Instance → เลือก **Ubuntu Server 22.04 LTS**, ประเภท `t3.small` เพียงพอสำหรับเริ่มต้น
3. สร้าง/เลือก key pair (.pem) สำหรับ SSH, เปิด Security Group ให้พอร์ต 22 (SSH), 80, 443 (HTTP/HTTPS)
4. หลัง launch แล้วผูก **Elastic IP** ให้เครื่อง (เพื่อให้ IP ไม่เปลี่ยนเวลารีสตาร์ท)

## ขั้นตอนที่ 2: ชี้โดเมนมาที่เซิร์ฟเวอร์ (ถ้ามีโดเมน)

ที่ผู้ให้บริการโดเมนของคุณ เพิ่ม DNS record ประเภท `A` ชี้ไปที่ IP ของเครื่อง VPS เช่น
```
loan.มูลนิธิของคุณ.org   A   <IP ของเครื่อง>
```
ถ้ายังไม่มีโดเมน จะเข้าผ่าน `http://<IP>` ไปพลาง ๆ ก่อนได้ แต่**ไม่แนะนำให้ใช้งานจริงแบบไม่มี HTTPS** เพราะข้อมูลที่ส่งเป็น PII/สุขภาพ — แนะนำซื้อโดเมนราคาประหยัด (เช่น .com ~300-400 บาท/ปี) ก่อนเปิดใช้งานจริง

## ขั้นตอนที่ 3: SSH เข้าเครื่องแล้วรันสคริปต์ติดตั้งอัตโนมัติ

```bash
ssh root@<IP ของเครื่อง>
```

คัดลอกทั้งบล็อกด้านล่างไปวางรันทีเดียว (สคริปต์นี้อยู่ในไฟล์ `deploy/setup-ubuntu.sh` ของโปรเจกต์ด้วย):

```bash
curl -fsSL https://raw.githubusercontent.com/nodesource/distributions/main/deb/setup_20.x | bash -
apt-get install -y nodejs nginx git
npm install -g pm2
mkdir -p /var/www && cd /var/www
# อัปโหลดโปรเจกต์ของคุณมาไว้ที่นี่ (ดูขั้นตอนที่ 4)
```

## ขั้นตอนที่ 4: อัปโหลดโปรเจกต์ขึ้นเซิร์ฟเวอร์

จากเครื่องของคุณเอง (ไม่ใช่ในเซิร์ฟเวอร์) รันคำสั่งนี้เพื่อส่งไฟล์โปรเจกต์ทั้งหมดขึ้นไป (แก้ `<IP>` เป็น IP จริง):

```bash
scp -r medequip-loan root@<IP>:/var/www/medequip-loan
```

หรือถ้าคุณ push โค้ดขึ้น GitHub ไว้แล้ว ก็ `git clone` บนเซิร์ฟเวอร์แทนได้เช่นกัน

## ขั้นตอนที่ 5: ติดตั้งและตั้งค่าบนเซิร์ฟเวอร์

กลับไปที่ terminal ที่ SSH เข้าเซิร์ฟเวอร์อยู่:

```bash
cd /var/www/medequip-loan
npm install
cp .env.example .env
nano .env   # ตั้ง SESSION_SECRET เป็นค่าสุ่มยาว ๆ, ตั้งรหัสผ่าน admin/staff เริ่มต้นให้ปลอดภัย
npm run seed
```

รันแอปด้วย pm2 (จะรันต่อเนื่องแม้ปิด terminal และรีสตาร์ทอัตโนมัติเมื่อเซิร์ฟเวอร์ reboot):

```bash
pm2 start server/server.js --name medequip-loan
pm2 save
pm2 startup   # แล้ว copy คำสั่งที่มันแสดงมารันอีกที
```

## ขั้นตอนที่ 6: ตั้ง Nginx เป็น reverse proxy + HTTPS ฟรีด้วย Let's Encrypt

สร้างไฟล์ `/etc/nginx/sites-available/medequip-loan`:

```nginx
server {
    listen 80;
    server_name loan.มูลนิธิของคุณ.org;   # แก้เป็นโดเมนจริงของคุณ

    client_max_body_size 10M;   # อนุญาตอัปโหลดรูปภาพขนาดใหญ่ขึ้น

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

เปิดใช้งานและออก HTTPS certificate ฟรี:

```bash
ln -s /etc/nginx/sites-available/medequip-loan /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d loan.มูลนิธิของคุณ.org
```

certbot จะตั้งค่า HTTPS ให้อัตโนมัติและต่ออายุ certificate ให้เองทุก ~60 วัน

สุดท้ายเปิดไฟล์ `.env` แล้วตั้ง (ให้ cookie ทำงานถูกต้องหลัง HTTPS):
```
NODE_ENV=production
TRUST_PROXY=1
```
แล้ว `pm2 restart medequip-loan`

## เสร็จแล้ว!

เข้าใช้งานได้ที่ `https://loan.มูลนิธิของคุณ.org` (หน้าเจ้าหน้าที่) และ `https://loan.มูลนิธิของคุณ.org/request.html` (ฟอร์มคำขอสาธารณะ) — แจก URL หลังนี้ให้ผู้ป่วย/ผู้ดูแลได้เลย

## การอัปเดตโค้ดในอนาคต

```bash
# อัปโหลดไฟล์ที่แก้ใหม่ทับของเดิม (scp หรือ git pull)
cd /var/www/medequip-loan
npm install        # ถ้ามีการเพิ่ม dependency ใหม่
pm2 restart medequip-loan
```

## สำรองข้อมูล (สำคัญมาก)

ตั้ง cron job สำรองโฟลเดอร์ `data/` และ `uploads/` ไปเก็บที่อื่นทุกวัน เช่น:
```bash
crontab -e
# เพิ่มบรรทัดนี้ (สำรองไปที่โฟลเดอร์ backups ทุกวันตี 2)
0 2 * * * tar -czf /root/backups/medequip-$(date +\%F).tar.gz -C /var/www/medequip-loan data uploads
```
แนะนำให้ดาวน์โหลดไฟล์ backup ออกมาเก็บไว้อีกที่หนึ่งเป็นระยะ (เช่น Google Drive ส่วนตัวของแอดมิน) เผื่อเซิร์ฟเวอร์มีปัญหา

## ถ้าอยากให้ผมช่วย deploy ให้เลย

ผมไม่มีบัญชี/บัตรเครดิตของคุณเพื่อสมัคร VPS ให้โดยตรง — ต้องให้คุณสมัครเครื่องเอง (ขั้นตอนที่ 1) แล้วส่ง IP + สิทธิ์ SSH access ให้ผมในเซสชันนี้ (หรือทำตามคู่มือด้านบนเอง) ผมช่วยรันคำสั่งที่เหลือทั้งหมดให้ได้ทันทีถ้าต้องการ

#!/usr/bin/env bash
# รันสคริปต์นี้บนเครื่อง Ubuntu 22.04 VPS ใหม่ (รันด้วย root หรือ sudo)
# ติดตั้ง Node.js, Nginx, pm2 — ไม่ได้อัปโหลดโปรเจกต์ให้อัตโนมัติ (ทำตามขั้นตอนที่ 4 ใน DEPLOY.md)
set -e

echo "== ติดตั้ง Node.js 20.x =="
curl -fsSL https://raw.githubusercontent.com/nodesource/distributions/main/deb/setup_20.x | bash -
apt-get install -y nodejs nginx git

echo "== ติดตั้ง pm2 (process manager) =="
npm install -g pm2

echo "== ติดตั้ง certbot สำหรับ HTTPS ฟรี =="
apt-get install -y certbot python3-certbot-nginx

mkdir -p /var/www
echo ""
echo "ติดตั้งพื้นฐานเสร็จแล้ว ขั้นตอนถัดไป:"
echo "1. อัปโหลดโปรเจกต์มาไว้ที่ /var/www/medequip-loan (ดู DEPLOY.md ขั้นตอนที่ 4)"
echo "2. cd /var/www/medequip-loan && npm install && cp .env.example .env"
echo "3. แก้ .env แล้วรัน npm run seed"
echo "4. pm2 start server/server.js --name medequip-loan && pm2 save && pm2 startup"
echo "5. ตั้งค่า Nginx + certbot ตาม DEPLOY.md ขั้นตอนที่ 6"

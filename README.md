# ระบบรับแจ้งและติดตามสถานการณ์น้ำ (Water Watch)

เว็บแอป (Next.js App Router + TypeScript + Tailwind, PWA, ภาษาไทย/พ.ศ./Asia/Bangkok) สำหรับโครงการบ้านจัดสรร
- เจ้าหน้าที่โครงการรายงานสถานการณ์/ระดับน้ำ/รูปถ่าย (mobile-first)
- ผู้บริหารเห็นภาพรวมทุกโครงการ + ข้อมูลหน่วยงานกลาง + แผนที่ + กราฟ + export Excel/PDF
- Chat ถามตอบ (Claude tool use, สตรีม) ตามสิทธิ์ของผู้ถาม

## รันทันที (ไม่ต้องมี credential — ทุกบริการเป็น mock)
```bash
npm install
npm run dev            # http://localhost:3000  → ปุ่ม "Dev login" เลือกบทบาท
# หรือ
docker compose up --build   # app + redis, http://localhost:3000
```
บัญชีตัวอย่าง (Dev login): admin / exec / manager / staff1 (โครงการ NBR01) / staff2 (PTH02, AYA03 ดูอย่างเดียว) — `@example.com`

คำสั่ง: `npm test` (Vitest) · `npm run test:e2e` (Playwright, ใช้ Chromium ที่ติดตั้งไว้) · `npm run typecheck` · `npm run seed` · `npm run setup:sheets`

## เปลี่ยนเป็น real ทีละบริการ (คัดลอก `.env.example` → `.env`)
1. **Google Sheets**: สร้าง service account + สเปรดชีตว่าง แชร์ให้ service account (Editor) → ตั้ง `SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` → `npm run setup:sheets` → `npm run seed` (ถ้าต้องการข้อมูลตัวอย่าง) → เพิ่ม admin คนแรกในชีต `Users` (role=admin, status=active, email) หรือรัน seed แล้วแก้
2. **รูป**: ตั้ง `S3_*` (Cloudflare R2: endpoint `https://<account>.r2.cloudflarestorage.com`, region `auto`) — bucket เป็น private; แอปออก signed URL อายุ 2 นาทีหลังตรวจสิทธิ์ทุกครั้ง
3. **Login**: `AUTH_SECRET`, `AUTH_URL` + LINE (`AUTH_LINE_ID/SECRET`, callback `/api/auth/callback/line`) / Google (`AUTH_GOOGLE_ID/SECRET`, callback `/api/auth/callback/google`) / อีเมล (`SMTP_URL`)
4. **Redis**: `REDIS_URL` (จำเป็นเมื่อรันหลาย instance)
5. **LINE แจ้งเตือน**: `LINE_CHANNEL_ACCESS_TOKEN`, `ADMIN_LINE_USER_IDS`
6. **หน่วยงานน้ำ**: `WATER_API_BASE_URL` · **Chat**: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`
7. **Job**: เรียก `GET/POST /api/cron/remind` (เตือนเลยรอบรายงาน, ทุก 30 นาที) และ `/api/cron/refresh` (ดึงข้อมูลหน่วยงาน/เตือนสถานี, ทุก 20 นาที) ด้วย `Authorization: Bearer $CRON_SECRET` หรือ `ENABLE_INTERNAL_CRON=1` (instance เดียว)

## สถาปัตยกรรม
```
src/lib/repo      Repository interface + MockRepository + GoogleSheetsRepository (schema.ts = นิยามชีต)
src/lib/services  business logic (reports, access, admin, chat, export, jobs …) — ไม่รู้จัก Sheets
src/lib/adapters  storage (S3/local), line, water (real/mock)
src/lib/core      env/โหมด, kv (Redis/memory: cache+lock), errors, time
src/app/api       route handlers (zod + ตรวจสิทธิ์ฝั่ง server ทุกตัว)
```
ย้ายไป PostgreSQL: เขียน `Repository` ตัวใหม่ (list/get/insert/update-CAS/remove) แล้วสลับใน `src/lib/repo/index.ts`

## ความปลอดภัยโดยสรุป
middleware บังคับ login ทุกหน้า/API · สิทธิ์และสถานะผู้ใช้อ่านจากชีตทุก request · signed URL รูปหลังตรวจสิทธิ์ · chat tool ตรวจสิทธิ์ต่อโครงการ · cron ใช้ secret · magic link ใช้ครั้งเดียว · อัปโหลดตรวจเป็นรูปจริงและตัด EXIF

สมมติฐานและข้อจำกัดทั้งหมด (รวมสิ่งที่ยังไม่ได้ทดสอบกับบริการจริง): [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)

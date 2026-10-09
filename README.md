# ระบบรับแจ้งและติดตามสถานการณ์น้ำ (Water Watch)

เว็บแอป (Next.js App Router + TypeScript + Tailwind, PWA, ภาษาไทย/พ.ศ./Asia/Bangkok) สำหรับโครงการบ้านจัดสรร
- เจ้าหน้าที่โครงการรายงานสถานการณ์/ระดับน้ำ/รูปถ่าย (mobile-first)
- ผู้บริหารเห็นภาพรวมทุกโครงการ + ข้อมูลหน่วยงานกลาง + แผนที่ + กราฟ + export Excel/PDF
- Chat ถามตอบ (Claude tool use, สตรีม) ตามสิทธิ์ของผู้ถาม

## รันทันที (ไม่ต้องมี credential — ฐานข้อมูล/รูป/LINE/หน่วยงานน้ำ/Claude เป็น mock)
```bash
npm install
npm run dev            # http://localhost:3000  → ปุ่ม "Dev login" เลือกบทบาท
# หรือ
docker compose up --build   # app + PostgreSQL + Redis, http://localhost:3000 (seed ข้อมูลเดโมให้)
```
บัญชีตัวอย่าง (Dev login): admin / exec / manager / staff1 (โครงการ NBR01) / staff2 (PTH02, AYA03 ดูอย่างเดียว) — `@example.com`

คำสั่ง: `npm test` (Vitest, mock) · `TEST_DATABASE_URL=postgres://… npm run test:pg` (Vitest กับ PostgreSQL จริง) · `npm run test:e2e` (Playwright, ใช้ Chromium ที่ติดตั้งไว้) · `npm run typecheck` · `npm run seed` · `npm run setup:db`

## เปลี่ยนเป็น real ทีละบริการ (คัดลอก `.env.example` → `.env`)
1. **PostgreSQL**: ตั้ง `DATABASE_URL` (และ `DATABASE_SSL=1` ถ้าต้องใช้ TLS) ตารางถูกสร้าง/migrate อัตโนมัติเมื่อแอปเริ่มทำงาน (หรือสั่งเอง `npm run setup:db`) แล้วสร้าง admin คนแรกด้วย `BOOTSTRAP_ADMIN_EMAIL=you@example.com` (ทำงานเมื่อตาราง users ว่าง) — เข้าสู่ระบบด้วยอีเมล/Google/LINE ที่ตรงกับอีเมลนั้น; ถ้าอยากได้ข้อมูลเดโมให้ `AUTO_SEED=1` หรือ `npm run seed`
2. **รูป**: ตั้ง `S3_*` (Cloudflare R2: endpoint `https://<account>.r2.cloudflarestorage.com`, region `auto`) — bucket เป็น private; แอปออก signed URL อายุ 2 นาทีหลังตรวจสิทธิ์ทุกครั้ง
3. **Login**: `AUTH_SECRET`, `AUTH_URL` + LINE (`AUTH_LINE_ID/SECRET`, callback `/api/auth/callback/line`) / Google (`AUTH_GOOGLE_ID/SECRET`, callback `/api/auth/callback/google`) / อีเมล (`SMTP_URL`)
4. **Redis**: `REDIS_URL` (จำเป็นเมื่อรันหลาย instance)
5. **LINE แจ้งเตือน**: `LINE_CHANNEL_ACCESS_TOKEN`, `ADMIN_LINE_USER_IDS`
6. **หน่วยงานน้ำ**: `WATER_API_BASE_URL` · **Chat**: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`
7. **Job**: เรียก `GET/POST /api/cron/remind` (เตือนเลยรอบรายงาน, ทุก 30 นาที) และ `/api/cron/refresh` (ดึงข้อมูลหน่วยงาน/เตือนสถานี, ทุก 20 นาที) ด้วย `Authorization: Bearer $CRON_SECRET` หรือ `ENABLE_INTERNAL_CRON=1` (instance เดียว)

## สถาปัตยกรรม
```
src/lib/repo      Repository interface + PostgresRepository + MockRepository (schema.ts = นิยามตาราง)
src/lib/services  business logic (reports, access, admin, chat, export, jobs …) — ไม่รู้จัก SQL
src/lib/adapters  storage (S3/local), line, water (real/mock)
src/lib/core      env/โหมด, kv (Redis/memory: cache+lock), errors, time
src/app/api       route handlers (zod + ตรวจสิทธิ์ฝั่ง server ทุกตัว)
```
ที่เก็บข้อมูลหลักคือ PostgreSQL; การเขียนทับซ้อนกันใช้ `UPDATE … WHERE version = $n` (atomic compare-and-set) ร่วมกับ lock ต่อโครงการ

## ความปลอดภัยโดยสรุป
middleware บังคับ login ทุกหน้า/API · สิทธิ์และสถานะผู้ใช้อ่านจากฐานข้อมูลทุก request · signed URL รูปหลังตรวจสิทธิ์ · chat tool ตรวจสิทธิ์ต่อโครงการ · cron ใช้ secret · magic link ใช้ครั้งเดียว · อัปโหลดตรวจเป็นรูปจริงและตัด EXIF

สมมติฐานและข้อจำกัดทั้งหมด (รวมสิ่งที่ยังไม่ได้ทดสอบกับบริการจริง): [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)

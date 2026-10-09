# สมมติฐานและการตัดสินใจ

สเปกต้นฉบับ **ถูกตัดกลางคัน** ที่นิยาม `AuditLog` (`log_id, at, user_id, action, entity, entity_id,`) จึงไม่มีสเปกส่วนหลังจากนั้น
(เช่น UI รายละเอียด, ตารางเพิ่มเติม, NFR) — ส่วนที่ขาดทั้งหมดตัดสินใจเองตามบริบทและบันทึกไว้ที่นี่

## ข้อมูล / PostgreSQL
ที่เก็บข้อมูลหลักเปลี่ยนจาก Google Sheets เป็น **PostgreSQL** (ตามที่ผู้ใช้ขอภายหลัง) — โค้ด Sheets ถูกลบ (ยังกู้ได้จาก git history ที่ commit ก่อนหน้า)

| เรื่อง | การตัดสินใจ | เหตุผล |
|---|---|---|
| ตาราง | สร้างจาก `src/lib/repo/schema.ts` เป็น `users, user_project_access, projects, current_status, reports, report_photos, audit_log, station_links`; primary key ตามนิยาม (reports = `report_id, revision`) | schema เดียวใช้ทั้ง DDL, mock และ type |
| คอลัมน์เมตา | ทุกตารางมี `version, updated_at, updated_by` | สเปกกำหนดให้ "ทุกแถว" มี optimistic locking |
| ชนิดคอลัมน์ | text / double precision / integer (revision, version, จำนวนหลัง, รอบรายงาน); เวลาเก็บเป็น ISO-8601 UTC ใน text | คงรูปแบบเดิมของ repository interface; ย้ายเป็น timestamptz ได้ภายหลังโดยแก้เฉพาะ `postgres.ts` |
| Migration | `ensureSchema()` ทำ `CREATE TABLE/INDEX IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` ตอนแอปเริ่ม (หรือ `npm run setup:db`) | idempotent; ยังไม่มีเครื่องมือ migration แยก — เปลี่ยน schema ที่ไม่ใช่แค่เพิ่มคอลัมน์ต้องเขียน migration เอง |
| Optimistic locking | `UPDATE … SET version = version + 1 WHERE key AND version = $expected RETURNING *` (atomic ในคำสั่งเดียว); ไม่ตรง => อ่านแถวล่าสุดแล้ว throw 409 | ปลอดภัยแม้ไม่มี lock; lock ต่อโครงการยังคงไว้ให้ลำดับ read-modify-write หลายขั้น (สร้างรายงาน → คำนวณ CurrentStatus) ถูกต้อง |
| การอ่าน | services ยังอ่านทั้งตารางแล้วกรองในหน่วยความจำ (ผ่าน `list`) | เรียบง่าย พอสำหรับระดับหลายพันรายงาน; ถ้าโตกว่านี้ให้เพิ่ม query แบบมีเงื่อนไขใน `Repository` (มีดัชนี project_id/reported_at รอแล้ว) |
| Bootstrap | `BOOTSTRAP_ADMIN_EMAIL` สร้าง admin คนแรกเมื่อ users ว่าง; `AUTO_SEED=1` ใส่ข้อมูลเดโม (ใช้กับเดโม/compose เท่านั้น) | แทนการเพิ่มผู้ใช้คนแรกด้วยมือ |
| Pool/SSL | pool สูงสุด 10; `DATABASE_SSL=1` เปิด TLS (ไม่ตรวจ CA เพื่อรองรับผู้ให้บริการที่ใช้ cert ภายใน — เข้มงวดขึ้นได้ใน `postgres.ts`) | |
| Mock | ไม่มี `DATABASE_URL` => MockRepository (memory + ไฟล์ JSON) ไว้ dev/test; ทดสอบ concurrency บน PG จริงด้วย `TEST_DATABASE_URL` | |
| Reports key | คีย์ประกอบ `report_id#revision` | append-only: แก้ไข/ยกเลิก = แถว revision ใหม่ ไม่ทับของเดิม |
| void | สร้าง revision ใหม่สถานะ `void` (ไม่แก้แถวเดิม) | รายงาน "ปัจจุบัน" = revision สูงสุดของ report_id |
| ReportPhotos | ผูกกับ `report_id` (ไม่ผูก revision); สูงสุด 10 รูป/รายงาน | รูปคงอยู่เมื่อแก้ไขรายงาน |
| AuditLog | เพิ่ม `project_id, detail(JSON), ip` | ค้นย้อนหลังตามโครงการได้ |
| `station_links` | link_id, project_id, provider, station_id, station_name, river, note | สเปกให้ admin "ผูกสถานีภายนอก" แต่ไม่ได้ระบุที่เก็บ |
| ระดับสถานการณ์ | เจ้าหน้าที่เลือกได้ แต่ระบบบังคับไม่ให้ต่ำกว่าที่เกณฑ์ (ซม.) คำนวณได้ | กันประเมินต่ำเกินจริง |
| CurrentStatus | คำนวณใหม่ภายใต้ lock ของโครงการทุกครั้งที่ create/revise/void จากรายงาน `reported_at` ล่าสุดที่ไม่ void | ถูกต้องแม้กรอกรายงานย้อนหลัง |
| การลบ | users → `disabled`, projects → `archived` (soft delete); access/stations ลบแถวจริง | รักษา audit trail |

## สิทธิ์
- `admin` และ `executive` เห็นทุกโครงการ (executive อ่านอย่างเดียว); `staff`/`manager` ได้เฉพาะโครงการใน `UserProjectAccess` ที่ยังไม่หมดอายุ (`valid_to` รวมทั้งวัน) ; manager ต่างจาก staff ที่ใช้กับหลายโครงการ
- role/สิทธิ์ **ไม่เก็บใน JWT** — JWT เก็บแค่ `uid`/ตัวตน; ทุก request อ่านผู้ใช้จากฐานข้อมูล (cache 5 วินาที, ปิดบัญชีแล้ว invalidate ทันที)
- ผู้ที่ login ได้แต่ไม่อยู่ในตาราง users: เห็น `/pending`, แจ้ง admin ทาง LINE (ครั้งเดียว/ชม./ตัวตน) + บันทึก audit; เมื่อ admin เพิ่มแล้วไม่ต้อง login ใหม่
- ตัวตนเสริม (LINE ID/อีเมล) ผูกเข้ากับ user เดิมอัตโนมัติเมื่อ login ครั้งแรกด้วยวิธีนั้น
- Google: ขอ scope `openid email profile` เท่านั้น และปฏิเสธอีเมลที่ยังไม่ verified
- Email login = magic link ของเราเอง (JWT HS256, 15 นาที, ใช้ได้ครั้งเดียว, rate limit 1/นาที/อีเมล) เพราะต้องการ "database-less"; ไม่ใช้ Auth.js Email provider ที่ต้องมี adapter
- **Dev login**: เปิดเมื่อไม่ใช่ production และ DB เป็น mock (หรือ `AUTO_SEED=1`) ข้อยกเว้นใน production: `DEMO_DEV_LOGIN=1` (docker-compose ตั้งให้เพื่อให้ `docker compose up` ลองใช้ได้ทันที) ; เมื่อใช้ PostgreSQL จะรับเฉพาะอีเมล `@example.com` (ข้อมูลเดโม) — production จริงให้ `AUTO_SEED=0`, `DEMO_DEV_LOGIN=0`
- `/api/cron/*` ข้าม session แต่ต้องมี `Authorization: Bearer $CRON_SECRET` (ไม่ตั้ง = ปิด); `/api/health` เปิดสาธารณะ (ไม่มีข้อมูล) ; PWA assets (manifest, sw.js, ไอคอน, offline.html) เปิดเพื่อให้ติดตั้งได้ — ไม่มีหน้าข้อมูลใดเปิดสาธารณะ

## การแก้ไขทับซ้อน
- 409 ส่ง `current` (แถวล่าสุด) กลับ → UI แสดง `ConflictDialog` เลือกรายฟิลด์ "ของฉัน/ล่าสุด" แล้วบันทึกซ้ำบน version ล่าสุด
- soft lock = คำเตือนเท่านั้น (ไม่บล็อก) เก็บใน KV (Redis/memory) TTL 5 นาที heartbeat ทุก 60 วินาที

## Adapters (real/mock)
| บริการ | real เมื่อ | mock |
|---|---|---|
| ฐานข้อมูล | `DATABASE_URL` (PostgreSQL) | MockRepository (+ไฟล์ `.data/mock-db.json`, seed อัตโนมัติ) |
| รูป | `S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` (+`S3_ENDPOINT` สำหรับ R2) | ดิสก์ `.data/uploads` ผ่าน route ที่ตรวจสิทธิ์ |
| Redis | `REDIS_URL` | in-memory (เตือนใน log) |
| LINE push | `LINE_CHANNEL_ACCESS_TOKEN` | outbox ใน memory + log |
| หน่วยงานน้ำ | `WATER_API_BASE_URL` | ข้อมูลจำลอง 6 สถานี (เปลี่ยนตามเวลา) |
| Chat | `ANTHROPIC_API_KEY` | ตอบแบบกฎ ใช้ tool ชุดเดียวกัน |
- `FORCE_MOCK=1` บังคับ mock ทั้งหมด
- **Adapter หน่วยงานน้ำ real ยังไม่ได้ทดสอบกับ API จริง** (sandbox ไม่มีเครือข่ายออก): เขียนตาม ThaiWater open API (`/waterlevel_load`) แบบ parse defensively — ต้องตรวจ mapping ฟิลด์เมื่อใช้งานจริง ปรับที่ `src/lib/adapters/water.ts`
- LINE Login user ID ใช้เป็นปลายทาง push ได้ก็ต่อเมื่อ Messaging API channel อยู่ใน provider เดียวกับ LINE Login channel
- S3/R2, LINE, Anthropic real mode **ไม่ได้ทดสอบกับบริการจริง** (ไม่มี credential) — ทดสอบแล้วกับ PostgreSQL 16 และ Redis จริง (unit + e2e)
- โมเดล Chat ตั้งผ่าน `CLAUDE_MODEL` (ค่าเริ่มต้น `claude-sonnet-5-5`)

## อื่น ๆ
- วันที่แสดง พ.ศ. ผ่าน `Intl th-TH-u-ca-buddhist` เขตเวลา Asia/Bangkok; เก็บในฐานข้อมูลเป็น ISO UTC
- PDF ใช้ pdf-lib + ฟอนต์ Noto Sans Thai (OFL) ฝังใน `assets/fonts` (สองไฟล์ thai/latin สลับตามอักษร) — การวางวรรณยุกต์/สระลอยของ pdf-lib อาจไม่สมบูรณ์เท่า browser; หากต้องการคุณภาพสูงกว่าให้เปลี่ยนเป็น puppeteer
- รูป: ฝั่ง client ย่อ ≤1600px; ฝั่ง server ตรวจเป็นรูปจริงด้วย sharp, หมุนตาม EXIF แล้ว **ตัด EXIF** (รวมพิกัดที่ฝังมา) สร้าง thumbnail 360px; พิกัดที่แนบมาจาก GPS ของเบราว์เซอร์ตอนรายงาน
- PWA: ติดตั้งได้ + หน้า offline; **ยังไม่มีคิวส่งรายงานตอนออฟไลน์** (เจตนา: เลี่ยงข้อมูลชนกันตอนซิงก์) ; SW cache เฉพาะ static
- ฟอร์มใช้ตัวเลขระดับน้ำเป็น ซม.; ข้อมูลหน่วยงานเป็น ม. (แสดงแยก ไม่แปลงอัตโนมัติ เพราะ datum ต่างกัน)
- แผนที่ใช้ tile จาก tile.openstreetmap.org โดยตรง (ปริมาณน้อย; production ที่ทราฟฟิกสูงควรใช้ tile provider ของตนเองตาม OSM tile policy)
- ไม่มีการตั้งค่า ESLint (ใช้ `tsc --noEmit` เป็น typecheck)

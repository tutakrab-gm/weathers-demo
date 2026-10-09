# สมมติฐานและการตัดสินใจ

สเปกต้นฉบับ **ถูกตัดกลางคัน** ที่นิยาม `AuditLog` (`log_id, at, user_id, action, entity, entity_id,`) จึงไม่มีสเปกส่วนหลังจากนั้น
(เช่น UI รายละเอียด, ชีตเพิ่มเติม, NFR) — ส่วนที่ขาดทั้งหมดตัดสินใจเองตามบริบทและบันทึกไว้ที่นี่

## ข้อมูล / Sheets
| เรื่อง | การตัดสินใจ | เหตุผล |
|---|---|---|
| คอลัมน์เมตา | ทุกชีตมี `version, updated_at, updated_by` ต่อท้าย | สเปกกำหนดให้ "ทุกแถว" มี optimistic locking |
| AuditLog | เพิ่ม `project_id, detail(JSON), ip` | ค้นย้อนหลังตามโครงการได้ |
| ชีตใหม่ `StationLinks` | link_id, project_id, provider, station_id, station_name, river, note | สเปกให้ admin "ผูกสถานีภายนอก" แต่ไม่ได้ระบุที่เก็บ |
| Reports key | คีย์ประกอบ `report_id#revision` | append-only: แก้ไข/ยกเลิก = แถว revision ใหม่ ไม่ทับของเดิม |
| void | สร้าง revision ใหม่สถานะ `void` (ไม่แก้แถวเดิม) | รักษา append-only จริง; รายงาน "ปัจจุบัน" = revision สูงสุดของ report_id |
| ReportPhotos | ผูกกับ `report_id` (ไม่ผูก revision) | รูปคงอยู่เมื่อแก้ไขรายงาน; สูงสุด 10 รูป/รายงาน |
| ระดับสถานการณ์ | เจ้าหน้าที่เลือกได้ แต่ระบบบังคับไม่ให้ต่ำกว่าที่เกณฑ์ (ซม.) คำนวณได้ | กันประเมินต่ำเกินจริง |
| CurrentStatus | คำนวณใหม่ภายใต้ lock ของโครงการทุกครั้งที่ create/revise/void จากรายงาน `reported_at` ล่าสุดที่ไม่ void | ถูกต้องแม้กรอกรายงานย้อนหลัง |
| การลบ | users → `disabled`, projects → `archived` (soft delete); access/stations ลบแถวจริง | รักษา audit trail |
| Sheets ไม่มี transaction | write ต่อโครงการผ่าน lock (Redis หรือ in-memory) + compare-and-set version ที่อ่านสดจากชีตก่อนเขียน | ตามสเปก; ระหว่างตรวจ version กับเขียนยังมีช่องว่างเล็ก ๆ ข้าม instance ถ้าไม่มี Redis จึงต้องใช้ Redis เมื่อมีหลาย instance |
| โควตา Sheets | อ่านทั้งชีตแล้ว cache 5 วินาที (`SHEETS_CACHE_TTL_MS`), `batchGet` อุ่น cache, backoff แบบ exponential เมื่อ 429/5xx | อ่านทั้งชีตไม่ขยายได้ไม่จำกัด — เมื่อ Reports เกินหลักหมื่นแถวให้ย้ายไป PostgreSQL ผ่าน `Repository` |

## สิทธิ์
- `admin` และ `executive` เห็นทุกโครงการ (executive อ่านอย่างเดียว); `staff`/`manager` ได้เฉพาะโครงการใน `UserProjectAccess` ที่ยังไม่หมดอายุ (`valid_to` รวมทั้งวัน) ; manager ต่างจาก staff ที่ใช้กับหลายโครงการ
- role/สิทธิ์ **ไม่เก็บใน JWT** — JWT เก็บแค่ `uid`/ตัวตน; ทุก request อ่านผู้ใช้จากชีต (cache 5 วินาที, ปิดบัญชีแล้ว invalidate ทันที)
- ผู้ที่ login ได้แต่ไม่อยู่ในชีต: เห็น `/pending`, แจ้ง admin ทาง LINE (ครั้งเดียว/ชม./ตัวตน) + บันทึก audit; เมื่อ admin เพิ่มแล้วไม่ต้อง login ใหม่
- ตัวตนเสริม (LINE ID/อีเมล) ผูกเข้ากับ user เดิมอัตโนมัติเมื่อ login ครั้งแรกด้วยวิธีนั้น
- Google: ขอ scope `openid email profile` เท่านั้น และปฏิเสธอีเมลที่ยังไม่ verified
- Email login = magic link ของเราเอง (JWT HS256, 15 นาที, ใช้ได้ครั้งเดียว, rate limit 1/นาที/อีเมล) เพราะต้องการ "database-less"; ไม่ใช้ Auth.js Email provider ที่ต้องมี adapter
- **Dev login**: เปิดเมื่อ Sheets เป็น mock และไม่ใช่ production เท่านั้น ข้อยกเว้น: `DEMO_DEV_LOGIN=1` (docker-compose ตั้งค่าเริ่มต้นให้เพื่อให้ `docker compose up` ลองใช้ได้ทันที) — ปิดอัตโนมัติเมื่อมี `SHEET_ID` จริง
- `/api/cron/*` ข้าม session แต่ต้องมี `Authorization: Bearer $CRON_SECRET` (ไม่ตั้ง = ปิด); `/api/health` เปิดสาธารณะ (ไม่มีข้อมูล) ; PWA assets (manifest, sw.js, ไอคอน, offline.html) เปิดเพื่อให้ติดตั้งได้ — ไม่มีหน้าข้อมูลใดเปิดสาธารณะ

## การแก้ไขทับซ้อน
- 409 ส่ง `current` (แถวล่าสุด) กลับ → UI แสดง `ConflictDialog` เลือกรายฟิลด์ "ของฉัน/ล่าสุด" แล้วบันทึกซ้ำบน version ล่าสุด
- soft lock = คำเตือนเท่านั้น (ไม่บล็อก) เก็บใน KV (Redis/memory) TTL 5 นาที heartbeat ทุก 60 วินาที

## Adapters (real/mock)
| บริการ | real เมื่อ | mock |
|---|---|---|
| Sheets | `SHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` | MockRepository (+ไฟล์ `.data/mock-db.json`, seed อัตโนมัติ) |
| รูป | `S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` (+`S3_ENDPOINT` สำหรับ R2) | ดิสก์ `.data/uploads` ผ่าน route ที่ตรวจสิทธิ์ |
| Redis | `REDIS_URL` | in-memory (เตือนใน log) |
| LINE push | `LINE_CHANNEL_ACCESS_TOKEN` | outbox ใน memory + log |
| หน่วยงานน้ำ | `WATER_API_BASE_URL` | ข้อมูลจำลอง 6 สถานี (เปลี่ยนตามเวลา) |
| Chat | `ANTHROPIC_API_KEY` | ตอบแบบกฎ ใช้ tool ชุดเดียวกัน |
- `FORCE_MOCK=1` บังคับ mock ทั้งหมด
- **Adapter หน่วยงานน้ำ real ยังไม่ได้ทดสอบกับ API จริง** (sandbox ไม่มีเครือข่ายออก): เขียนตาม ThaiWater open API (`/waterlevel_load`) แบบ parse defensively — ต้องตรวจ mapping ฟิลด์เมื่อใช้งานจริง ปรับที่ `src/lib/adapters/water.ts`
- LINE Login user ID ใช้เป็นปลายทาง push ได้ก็ต่อเมื่อ Messaging API channel อยู่ใน provider เดียวกับ LINE Login channel
- Google Sheets / S3 / LINE / Anthropic real mode **ไม่ได้ทดสอบกับบริการจริง** (ไม่มี credential) — ทดสอบเฉพาะ mock และ Redis จริง
- โมเดล Chat ตั้งผ่าน `CLAUDE_MODEL` (ค่าเริ่มต้น `claude-sonnet-5-5`)

## อื่น ๆ
- วันที่แสดง พ.ศ. ผ่าน `Intl th-TH-u-ca-buddhist` เขตเวลา Asia/Bangkok; เก็บใน Sheets เป็น ISO UTC
- PDF ใช้ pdf-lib + ฟอนต์ Noto Sans Thai (OFL) ฝังใน `assets/fonts` (สองไฟล์ thai/latin สลับตามอักษร) — การวางวรรณยุกต์/สระลอยของ pdf-lib อาจไม่สมบูรณ์เท่า browser; หากต้องการคุณภาพสูงกว่าให้เปลี่ยนเป็น puppeteer
- รูป: ฝั่ง client ย่อ ≤1600px; ฝั่ง server ตรวจเป็นรูปจริงด้วย sharp, หมุนตาม EXIF แล้ว **ตัด EXIF** (รวมพิกัดที่ฝังมา) สร้าง thumbnail 360px; พิกัดที่แนบมาจาก GPS ของเบราว์เซอร์ตอนรายงาน
- PWA: ติดตั้งได้ + หน้า offline; **ยังไม่มีคิวส่งรายงานตอนออฟไลน์** (เจตนา: เลี่ยงข้อมูลชนกันตอนซิงก์) ; SW cache เฉพาะ static
- ฟอร์มใช้ตัวเลขระดับน้ำเป็น ซม.; ข้อมูลหน่วยงานเป็น ม. (แสดงแยก ไม่แปลงอัตโนมัติ เพราะ datum ต่างกัน)
- แผนที่ใช้ tile จาก tile.openstreetmap.org โดยตรง (ปริมาณน้อย; production ที่ทราฟฟิกสูงควรใช้ tile provider ของตนเองตาม OSM tile policy)
- ไม่มีการตั้งค่า ESLint (ใช้ `tsc --noEmit` เป็น typecheck)

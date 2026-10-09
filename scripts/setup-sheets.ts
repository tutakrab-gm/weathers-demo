/** npm run setup:sheets — สร้างชีตและหัวคอลัมน์ในสเปรดชีต SHEET_ID (idempotent) */
import { loadEnv } from "./load-env";
loadEnv();
async function main() {
  const { modes, env } = await import("../src/lib/core/env");
  if (modes.sheets !== "real") {
    console.error("ต้องตั้ง SHEET_ID และ GOOGLE_SERVICE_ACCOUNT_JSON (และไม่ตั้ง FORCE_MOCK) ก่อน — ดู .env.example");
    process.exit(1);
  }
  const { repo } = await import("../src/lib/repo");
  const r = await repo().ensureSchema();
  console.log(`สเปรดชีต ${env.sheetId}\n  สร้างใหม่: ${r.created.join(", ") || "-"}\n  มีอยู่แล้ว (อัปเดตหัวคอลัมน์): ${r.existing.join(", ") || "-"}`);
  console.log("อย่าลืมแชร์สเปรดชีตให้ service account (สิทธิ์ Editor) แล้วรัน npm run seed");
}
main().catch((e) => { console.error(e); process.exit(1); });

/** npm run setup:db — สร้าง/migrate ตารางใน PostgreSQL (DATABASE_URL) แบบ idempotent */
import { loadEnv } from "./load-env";
loadEnv();
async function main() {
  const { modes } = await import("../src/lib/core/env");
  if (modes.db !== "real") {
    console.error("ต้องตั้ง DATABASE_URL (และไม่ตั้ง FORCE_MOCK) ก่อน — ดู .env.example");
    process.exit(1);
  }
  const { repo } = await import("../src/lib/repo");
  const r = repo();
  const out = await r.ensureSchema();
  console.log(`สร้างใหม่: ${out.created.join(", ") || "-"}\nมีอยู่แล้ว (ตรวจคอลัมน์/ดัชนีแล้ว): ${out.existing.join(", ") || "-"}`);
  await (r as import("../src/lib/repo/postgres").PostgresRepository).close();
}
main().catch((e) => { console.error(e); process.exit(1); });

/** npm run seed — ใส่ข้อมูลตัวอย่าง (mock: รีเซ็ต .data/mock-db.json ; real: ใส่เมื่อชีต Users ว่างเท่านั้น) */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./load-env";
loadEnv();
async function main() {
  const { modes } = await import("../src/lib/core/env");
  if (modes.sheets === "mock") {
    const f = path.join(process.cwd(), ".data", "mock-db.json");
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  const { repo } = await import("../src/lib/repo");
  const r = repo();
  if (r.mode === "real") await r.ensureSchema();
  const { seedAll } = await import("../src/lib/services/seed");
  const out = await seedAll(r);
  if (r.mode === "mock") (r as import("../src/lib/repo/mock").MockRepository).flush();
  console.log(out.skipped ? "ข้ามการ seed: มีข้อมูลผู้ใช้อยู่แล้ว" : `seed สำเร็จ (${r.mode})`);
}
main().catch((e) => { console.error(e); process.exit(1); });

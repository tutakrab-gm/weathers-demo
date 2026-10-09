import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { modes } from "../core/env";
import { warnOnce } from "../core/logger";
import { MockRepository } from "./mock";
import { PostgresRepository } from "./postgres";
import type { Repository } from "./types";

const initCtx = new AsyncLocalStorage<boolean>();
const g = globalThis as unknown as { __repo?: Repository; __repoReady?: Promise<void> };

/** คืน repository ตามโหมด; mock จะ seed อัตโนมัติเมื่อว่าง */
export function repo(): Repository {
  if (g.__repo) return g.__repo;
  if (modes.db === "real") {
    g.__repo = new PostgresRepository();
  } else {
    warnOnce("repo", "ไม่มี DATABASE_URL: ใช้ MockRepository (ข้อมูลเก็บที่ .data/mock-db.json)");
    const persist = process.env.MOCK_PERSIST !== "0";
    g.__repo = new MockRepository({ file: persist ? path.join(process.cwd(), ".data", "mock-db.json") : undefined });
  }
  return g.__repo;
}

/** รอให้ mock seed เสร็จก่อนใช้งาน (เรียกใน requireUser / route handler) */
export async function repoReady(): Promise<Repository> {
  const r = repo();
  if (initCtx.getStore()) return r; // เรียกจากภายใน init (seed) — ห้ามรอตัวเอง (deadlock)
  g.__repoReady ??= initCtx.run(true, () => init(r));
  await g.__repoReady;
  return r;
}

/**
 * เริ่มต้นครั้งเดียวต่อโปรเซส
 * - mock: seed ข้อมูลตัวอย่างเมื่อว่าง
 * - postgres: migrate ตาราง (idempotent); ถ้า AUTO_SEED=1 และตาราง users ว่าง => seed เดโม;
 *   ถ้าตั้ง BOOTSTRAP_ADMIN_EMAIL และ users ว่าง => สร้าง admin คนแรกให้
 */
async function init(r: Repository) {
  if (r.mode === "mock") {
    if ((r as MockRepository).isEmpty) await (await import("../services/seed")).seedAll(r);
    return;
  }
  await r.ensureSchema();
  if ((await r.list("users")).length) return;
  if (process.env.AUTO_SEED === "1") { await (await import("../services/seed")).seedAll(r); return; }
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (email) {
    await r.insert("users", { user_id: "u_admin", email, display_name: "ผู้ดูแลระบบ", role: "admin", status: "active", created_at: new Date().toISOString() }, "bootstrap");
    console.log(`[water-watch] สร้าง admin คนแรก: ${email}`);
  }
}

export function __setRepo(r: Repository | undefined) { g.__repo = r; g.__repoReady = undefined; }

import { __setRepo } from "@/lib/repo";
import { MockRepository } from "@/lib/repo/mock";
import type { Repository } from "@/lib/repo/types";
import { __setKV, MemoryKV } from "@/lib/core/kv";
import { seedAll } from "@/lib/services/seed";
import type { Actor } from "@/lib/services/access";

/** TEST_DATABASE_URL ตั้งไว้ => ทดสอบกับ PostgreSQL จริง (ล้างตารางทุกเทสต์) ; ไม่ตั้ง => MockRepository */
export async function freshEnv(opts: { seed?: boolean } = { seed: true }): Promise<Repository> {
  let repo: Repository;
  if (process.env.TEST_DATABASE_URL) {
    const { PostgresRepository, pgTable } = await import("@/lib/repo/postgres");
    const { TABLES } = await import("@/lib/repo/schema");
    const pg = (globalThis as { __testPg?: InstanceType<typeof PostgresRepository> }).__testPg ??= new PostgresRepository(process.env.TEST_DATABASE_URL);
    await pg.ensureSchema();
    const pool = (pg as unknown as { pool: { query(q: string): Promise<unknown> } }).pool;
    await pool.query(`TRUNCATE ${Object.keys(TABLES).map((t) => pgTable(t as keyof typeof TABLES)).join(",")}`);
    repo = pg;
  } else repo = new MockRepository();
  __setRepo(repo);
  __setKV(new MemoryKV());
  if (opts.seed) await seedAll(repo);
  return repo;
}
/** จำลองความหน่วง/ read-modify-write ไม่ atomic (เฉพาะ mock; Postgres มี concurrency จริงอยู่แล้ว) */
export function slow(repo: Repository, ms: number) {
  if (repo instanceof MockRepository) { repo.racy = true; repo.latencyMs = ms; }
}
export const A = {
  admin: { user_id: "u_admin", role: "admin", display_name: "admin" } as Actor,
  exec: { user_id: "u_exec", role: "executive", display_name: "exec" } as Actor,
  mgr: { user_id: "u_mgr", role: "manager", display_name: "mgr" } as Actor,
  staff1: { user_id: "u_staff1", role: "staff", display_name: "staff1" } as Actor,
  staff2: { user_id: "u_staff2", role: "staff", display_name: "staff2" } as Actor,
};
export const blank = { level: null, water_level_cm: null, gauge_point: "", trend: null, affected_areas: "", affected_units: null, pump_status: "", actions_taken: "", note: "", lat: null, lng: null } as const;

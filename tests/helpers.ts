import { __setRepo } from "@/lib/repo";
import { MockRepository } from "@/lib/repo/mock";
import { __setKV, MemoryKV } from "@/lib/core/kv";
import { seedAll } from "@/lib/services/seed";
import type { Actor } from "@/lib/services/access";

export async function freshEnv(opts: { seed?: boolean } = { seed: true }) {
  const repo = new MockRepository();
  __setRepo(repo);
  __setKV(new MemoryKV());
  if (opts.seed) await seedAll(repo);
  return repo;
}
export const A = {
  admin: { user_id: "u_admin", role: "admin", display_name: "admin" } as Actor,
  exec: { user_id: "u_exec", role: "executive", display_name: "exec" } as Actor,
  mgr: { user_id: "u_mgr", role: "manager", display_name: "mgr" } as Actor,
  staff1: { user_id: "u_staff1", role: "staff", display_name: "staff1" } as Actor,
  staff2: { user_id: "u_staff2", role: "staff", display_name: "staff2" } as Actor,
};
export const blank = { level: null, water_level_cm: null, gauge_point: "", trend: null, affected_areas: "", affected_units: null, pump_status: "", actions_taken: "", note: "", lat: null, lng: null } as const;

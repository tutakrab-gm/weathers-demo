import { kv } from "../core/kv";
import { assertProjectAccess, type Actor } from "./access";

/** soft lock: ใครกำลังเปิดแก้ไขโครงการ (หมดอายุ 5 นาที ต่อด้วย heartbeat) — เป็นเพียงคำเตือน ไม่ใช่การบล็อก */
export const SOFT_LOCK_TTL_MS = 5 * 60_000;
const key = (pid: string, uid: string) => `presence:${pid}:${uid}`;

export interface Presence { user_id: string; name: string; since: number; at: number }

export async function heartbeat(actor: Actor, projectId: string): Promise<Presence[]> {
  await assertProjectAccess(actor, projectId, "edit");
  const store = kv();
  const prev = await store.get(key(projectId, actor.user_id));
  const since = prev ? (JSON.parse(prev) as Presence).since : Date.now();
  await store.set(key(projectId, actor.user_id), JSON.stringify({ user_id: actor.user_id, name: actor.display_name, since, at: Date.now() } satisfies Presence), SOFT_LOCK_TTL_MS);
  return others(actor, projectId);
}

export async function others(actor: Actor, projectId: string): Promise<Presence[]> {
  const store = kv();
  const out: Presence[] = [];
  for (const k of await store.keys(`presence:${projectId}:`)) {
    const v = await store.get(k);
    if (!v) continue;
    const p = JSON.parse(v) as Presence;
    if (p.user_id !== actor.user_id) out.push(p);
  }
  return out;
}

export async function release(actor: Actor, projectId: string) {
  await kv().del(key(projectId, actor.user_id));
}

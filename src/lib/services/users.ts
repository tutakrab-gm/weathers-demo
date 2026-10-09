import { kv } from "../core/kv";
import { repoReady } from "../repo";
import type { User } from "../repo/types";
import { notifyAdmins } from "./notify";
import { audit } from "./audit";

/** cache สั้น ๆ ของสถานะผู้ใช้ (ลดการอ่านฐานข้อมูล) ; ปิดบัญชีแล้ว invalidate ทันที */
const TTL = 5_000;
const g = globalThis as unknown as { __ucache?: Map<string, { u: User | null; at: number }> };
const cache = () => (g.__ucache ??= new Map());

export function invalidateUser(id: string) { cache().delete(id); }
export function invalidateAllUsers() { cache().clear(); }

export async function getUserById(id: string): Promise<User | null> {
  const hit = cache().get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.u;
  const u = await (await repoReady()).get("users", id, { fresh: true });
  cache().set(id, { u, at: Date.now() });
  return u;
}

export async function findUserByIdentity(id: { email?: string | null; line_user_id?: string | null }): Promise<User | null> {
  const users = await (await repoReady()).list("users", { fresh: true });
  const email = id.email?.trim().toLowerCase();
  return users.find((u) => (email && u.email.toLowerCase() === email) || (id.line_user_id && u.line_user_id === id.line_user_id)) ?? null;
}

/** ผู้ที่ login ได้แต่ไม่อยู่ในระบบ: แจ้ง admin ครั้งเดียวต่อตัวตนต่อชั่วโมง */
export async function reportUnknownLogin(provider: string, identity: { email?: string | null; line_user_id?: string | null; name?: string | null }) {
  const k = `pending-notified:${(identity.email || identity.line_user_id || "").toLowerCase()}`;
  if (!(await kv().setNx(k, "1", 3_600_000))) return;
  const who = [identity.name, identity.email, identity.line_user_id].filter(Boolean).join(" / ");
  await audit("system", "login.unregistered", "user", identity.email || identity.line_user_id || "", "", { provider, who });
  await notifyAdmins(`🔔 มีผู้ขอเข้าใช้งานแต่ยังไม่ได้ลงทะเบียน (${provider}): ${who}\nกรุณาเพิ่มในเมนูจัดการผู้ใช้เพื่ออนุมัติ`);
}

/** เมื่อ login ผ่าน LINE/อีเมลครั้งแรก ผูกตัวตนเสริมเข้ากับ user เดิม (ผู้ใช้หนึ่งคนหลายวิธี login) */
export async function linkIdentity(user: User, id: { email?: string | null; line_user_id?: string | null; avatar?: string | null }) {
  const patch: Partial<User> = {};
  if (id.line_user_id && !user.line_user_id) patch.line_user_id = id.line_user_id;
  if (id.email && !user.email) patch.email = id.email.toLowerCase();
  if (id.avatar && !user.avatar_url) patch.avatar_url = id.avatar;
  if (!Object.keys(patch).length) return user;
  try {
    const repo = await repoReady();
    const out = await kv().withLock("table:users", () => repo.update("users", user.user_id, user.version, patch, user.user_id));
    invalidateUser(user.user_id);
    return out;
  } catch { return user; } // version ชน = มีคนแก้พร้อมกัน ไม่เป็นไร ข้ามการผูกครั้งนี้
}

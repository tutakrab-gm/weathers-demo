import { auth } from "@/auth";
import { AppError, forbidden, unauthorized } from "../core/errors";
import { toActor, type Actor } from "../services/access";
import { findUserByIdentity, getUserById } from "../services/users";
import type { User } from "../repo/types";

export type Session =
  | { state: "anonymous" }
  | { state: "pending"; email: string | null; line: string | null }
  | { state: "disabled" }
  | { state: "active"; user: User; actor: Actor };

/**
 * ตรวจตัวตน + สถานะผู้ใช้จากฐานข้อมูลทุก request (cache สั้น ๆ 5 วินาที, ปิดบัญชีแล้ว invalidate ทันที)
 * ห้ามเชื่อ role/สิทธิ์ใน JWT — ใช้เฉพาะ uid แล้วอ่านจากฐานข้อมูลใหม่เสมอ
 */
export async function getSession(): Promise<Session> {
  const s = await auth();
  if (!s?.user) return { state: "anonymous" };
  const u = s.user as unknown as { uid: string | null; ident: { email: string | null; line: string | null } };
  let user: User | null = u.uid ? await getUserById(u.uid) : null;
  // ผู้ที่เคยรออนุมัติ: admin เพิ่มในระบบแล้ว ไม่ต้อง login ใหม่
  if (!user && !u.uid) user = await findUserByIdentity({ email: u.ident?.email, line_user_id: u.ident?.line });
  if (!user) return { state: "pending", email: u.ident?.email ?? null, line: u.ident?.line ?? null };
  if (user.status === "disabled") return { state: "disabled" };
  if (user.status !== "active") return { state: "pending", email: user.email, line: user.line_user_id };
  return { state: "active", user, actor: toActor(user) };
}

export async function requireActor(): Promise<{ user: User; actor: Actor }> {
  const s = await getSession();
  if (s.state === "anonymous") throw unauthorized();
  if (s.state === "pending") throw forbidden("บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบ");
  if (s.state === "disabled") throw new AppError(403, "disabled", "บัญชีถูกปิดการใช้งาน");
  return { user: s.user, actor: s.actor };
}

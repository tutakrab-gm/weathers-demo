import { forbidden, notFound } from "../core/errors";
import { repoReady } from "../repo";
import type { Access, Project, Role, User } from "../repo/types";

export interface Actor { user_id: string; role: Role; display_name: string; email?: string }

export const toActor = (u: User): Actor => ({ user_id: u.user_id, role: u.role, display_name: u.display_name, email: u.email });

const seesAll = (r: Role) => r === "admin" || r === "executive";
export const canWriteRole = (r: Role) => r === "admin" || r === "staff" || r === "manager";

function accessValid(a: Access, now = Date.now()): boolean {
  if (a.valid_from && new Date(a.valid_from).getTime() > now) return false;
  if (a.valid_to && new Date(a.valid_to).getTime() + 86_399_000 < now) return false; // รวมทั้งวันสุดท้าย
  return true;
}

/** map project_id -> access_level สำหรับผู้ใช้ (ตรวจฝั่ง server ทุกครั้ง) */
export async function accessMap(actor: Actor): Promise<Map<string, "view" | "edit">> {
  const repo = await repoReady();
  const out = new Map<string, "view" | "edit">();
  if (seesAll(actor.role)) {
    const projects = await repo.list("projects");
    for (const p of projects) if (p.status !== "archived") out.set(p.project_id, actor.role === "admin" ? "edit" : "view");
    return out;
  }
  const rows = (await repo.list("access")).filter((a) => a.user_id === actor.user_id && accessValid(a));
  const active = new Set((await repo.list("projects")).filter((p) => p.status !== "archived").map((p) => p.project_id));
  for (const a of rows) {
    if (!active.has(a.project_id)) continue;
    const lvl = a.access_level;
    if (out.get(a.project_id) !== "edit") out.set(a.project_id, lvl);
  }
  return out;
}

export async function assertProjectAccess(actor: Actor, projectId: string, need: "view" | "edit"): Promise<Project> {
  const repo = await repoReady();
  const project = await repo.get("projects", projectId);
  if (!project) throw notFound("ไม่พบโครงการ");
  const lvl = (await accessMap(actor)).get(projectId);
  if (!lvl) throw forbidden("ไม่มีสิทธิ์เข้าถึงโครงการนี้");
  if (need === "edit" && (lvl !== "edit" || !canWriteRole(actor.role))) throw forbidden("มีสิทธิ์ดูอย่างเดียวในโครงการนี้");
  return project;
}

export async function visibleProjects(actor: Actor): Promise<Project[]> {
  const repo = await repoReady();
  const m = await accessMap(actor);
  return (await repo.list("projects")).filter((p) => m.has(p.project_id)).sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export const assertAdmin = (a: Actor) => { if (a.role !== "admin") throw forbidden("เฉพาะผู้ดูแลระบบ"); };

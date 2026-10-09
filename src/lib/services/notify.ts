import { env } from "../core/env";
import { pushLine } from "../adapters/line";
import { repoReady } from "../repo";
import { LEVEL_TH } from "./levels";
import type { Level } from "../repo/types";

export async function notifyAdmins(text: string) {
  const repo = await repoReady();
  const ids = new Set(env.adminLineIds);
  for (const u of await repo.list("users")) if (u.role === "admin" && u.status === "active" && u.line_user_id) ids.add(u.line_user_id);
  if (ids.size === 0) console.log("[notify] (ไม่มีผู้รับ LINE) admin:", text);
  await Promise.all([...ids].map((id) => pushLine(id, text)));
}

export async function notifyProject(projectId: string, text: string, opts: { includeExecutives?: boolean } = {}) {
  const repo = await repoReady();
  const users = await repo.list("users");
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const targets = new Set<string>();
  for (const a of await repo.list("access")) {
    if (a.project_id !== projectId) continue;
    const u = byId.get(a.user_id);
    if (u?.status === "active" && u.line_user_id) targets.add(u.line_user_id);
  }
  if (opts.includeExecutives) for (const u of users) if (u.role === "executive" && u.status === "active" && u.line_user_id) targets.add(u.line_user_id);
  await Promise.all([...targets].map((id) => pushLine(id, text)));
}

export const levelAlertText = (name: string, level: Level, cm: number | null) =>
  `🚨 ${name}: ระดับ${LEVEL_TH[level]}${cm != null ? ` (${cm} ซม.)` : ""}`;

import { AppError, ConflictError } from "../core/errors";
import { kv } from "../core/kv";
import { newId } from "../core/ids";
import { nowIso } from "../core/time";
import { repoReady } from "../repo";
import type { CurrentStatus, Level, Project, Report } from "../repo/types";
import { assertProjectAccess, type Actor } from "./access";
import { audit } from "./audit";
import { LEVEL_RANK, levelFromCm, trendFromDelta } from "./levels";
import { levelAlertText, notifyProject } from "./notify";
import type { ReportInput } from "./schemas";

const projectLock = (pid: string) => `project:${pid}`;
export const reportKey = (id: string, rev: number) => `${id}#${rev}`;

/** แถวล่าสุด (revision สูงสุด) ของแต่ละ report_id */
export function latestRevisions(rows: Report[]): Report[] {
  const m = new Map<string, Report>();
  for (const r of rows) {
    const c = m.get(r.report_id);
    if (!c || Number(r.revision) > Number(c.revision)) m.set(r.report_id, r);
  }
  return [...m.values()];
}

export async function listReports(actor: Actor, projectId: string, opts: { includeVoid?: boolean; limit?: number; from?: string; to?: string } = {}) {
  await assertProjectAccess(actor, projectId, "view");
  const repo = await repoReady();
  let rows = latestRevisions((await repo.list("reports")).filter((r) => r.project_id === projectId));
  if (!opts.includeVoid) rows = rows.filter((r) => r.status !== "void");
  if (opts.from) rows = rows.filter((r) => r.reported_at >= opts.from!);
  if (opts.to) rows = rows.filter((r) => r.reported_at <= opts.to!);
  rows.sort((a, b) => (a.reported_at < b.reported_at ? 1 : -1));
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

export async function reportHistory(actor: Actor, projectId: string, reportId: string) {
  await assertProjectAccess(actor, projectId, "view");
  const repo = await repoReady();
  return (await repo.list("reports", { fresh: true })).filter((r) => r.report_id === reportId && r.project_id === projectId)
    .sort((a, b) => Number(a.revision) - Number(b.revision));
}

function buildRow(project: Project, input: ReportInput, prevCm: number | null | undefined, actor: Actor) {
  const computed = levelFromCm(input.water_level_cm, project);
  // ถ้าเจ้าหน้าที่ระบุระดับเอง ให้ยึดตามนั้น แต่ไม่ต่ำกว่าที่เกณฑ์คำนวณได้ (กันประเมินต่ำเกินจริง)
  let level: Level = input.level ?? computed ?? "normal";
  if (computed && LEVEL_RANK[computed] > LEVEL_RANK[level]) level = computed;
  const trend = input.trend ?? trendFromDelta(prevCm, input.water_level_cm) ?? "steady";
  return {
    project_id: project.project_id,
    reported_at: input.reported_at ?? nowIso(),
    level, water_level_cm: input.water_level_cm, gauge_point: input.gauge_point || project.gauge_point, trend,
    affected_areas: input.affected_areas, affected_units: input.affected_units, pump_status: input.pump_status,
    actions_taken: input.actions_taken, note: input.note, lat: input.lat, lng: input.lng,
    created_by: actor.user_id, created_at: nowIso(),
  };
}

export async function createReport(actor: Actor, projectId: string, input: ReportInput): Promise<Report> {
  const project = await assertProjectAccess(actor, projectId, "edit");
  const repo = await repoReady();
  const out = await kv().withLock(projectLock(projectId), async () => {
    const cur = await repo.get("currentStatus", projectId, { fresh: true });
    const row = await repo.insert("reports", { ...buildRow(project, input, cur?.water_level_cm, actor), report_id: newId("rpt"), revision: 1, status: "active" }, actor.user_id);
    const status = await recomputeStatus(projectId, actor.user_id);
    return { row, status, prev: cur };
  });
  await audit(actor.user_id, "report.create", "report", out.row.report_id, projectId, { level: out.row.level, cm: out.row.water_level_cm });
  await maybeAlert(project, out.prev, out.status);
  return out.row;
}

export async function reviseReport(actor: Actor, projectId: string, reportId: string, baseRevision: number, input: ReportInput): Promise<Report> {
  const project = await assertProjectAccess(actor, projectId, "edit");
  const repo = await repoReady();
  const res = await kv().withLock(projectLock(projectId), async () => {
    const all = (await repo.list("reports", { fresh: true })).filter((r) => r.report_id === reportId && r.project_id === projectId);
    if (!all.length) throw new AppError(404, "not_found", "ไม่พบรายงาน");
    const latest = all.reduce((a, b) => (Number(b.revision) > Number(a.revision) ? b : a));
    if (Number(latest.revision) !== baseRevision) throw new ConflictError({ ...latest }, "รายงานนี้ถูกแก้ไขโดยผู้อื่นแล้ว");
    if (latest.status === "void") throw new AppError(409, "void", "รายงานนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้");
    const prev = await repo.get("currentStatus", projectId, { fresh: true });
    const row = await repo.insert("reports", {
      ...buildRow(project, input, prev?.water_level_cm, actor), report_id: reportId, revision: Number(latest.revision) + 1, status: "active",
      created_by: latest.created_by, // ผู้สร้างเดิม; ผู้แก้ไขอยู่ที่ updated_by
    }, actor.user_id);
    const status = await recomputeStatus(projectId, actor.user_id);
    return { row, status, prev };
  });
  await audit(actor.user_id, "report.revise", "report", reportId, projectId, { revision: res.row.revision });
  await maybeAlert(project, res.prev, res.status);
  return res.row;
}

export async function voidReport(actor: Actor, projectId: string, reportId: string, baseRevision: number, reason: string): Promise<Report> {
  await assertProjectAccess(actor, projectId, "edit");
  const repo = await repoReady();
  const row = await kv().withLock(projectLock(projectId), async () => {
    const all = (await repo.list("reports", { fresh: true })).filter((r) => r.report_id === reportId && r.project_id === projectId);
    if (!all.length) throw new AppError(404, "not_found", "ไม่พบรายงาน");
    const latest = all.reduce((a, b) => (Number(b.revision) > Number(a.revision) ? b : a));
    if (Number(latest.revision) !== baseRevision) throw new ConflictError({ ...latest }, "รายงานนี้ถูกแก้ไขโดยผู้อื่นแล้ว");
    if (latest.status === "void") return latest;
    const { version: _v, updated_at: _u, updated_by: _b, ...copy } = latest as Report & { updated_at: string; updated_by: string };
    void _v; void _u; void _b;
    const r = await repo.insert("reports", { ...copy, revision: Number(latest.revision) + 1, status: "void", note: `[ยกเลิก] ${reason}${latest.note ? ` | ${latest.note}` : ""}`.slice(0, 2000) }, actor.user_id);
    await recomputeStatus(projectId, actor.user_id);
    return r;
  });
  await audit(actor.user_id, "report.void", "report", reportId, projectId, { reason });
  return row;
}

/**
 * CurrentStatus = รายงานล่าสุดที่ไม่ void (ตาม reported_at) ; ต้องเรียกภายใน lock ของโครงการ
 * ใช้ version check + retry เพื่อกันกรณี lock หลุด/หลาย instance
 */
export async function recomputeStatus(projectId: string, by: string): Promise<CurrentStatus> {
  const repo = await repoReady();
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = latestRevisions((await repo.list("reports", { fresh: true })).filter((r) => r.project_id === projectId)).filter((r) => r.status === "active");
    rows.sort((a, b) => (a.reported_at < b.reported_at ? 1 : a.reported_at > b.reported_at ? -1 : Number(b.created_at < a.created_at ? 1 : -1)));
    const last = rows[0];
    const patch: Partial<CurrentStatus> = last
      ? { level: last.level, water_level_cm: last.water_level_cm, trend: last.trend, affected_units: last.affected_units, last_report_id: last.report_id, last_reported_at: last.reported_at, last_reported_by: last.created_by }
      : { level: "normal", water_level_cm: null, trend: "steady", affected_units: null, last_report_id: "", last_reported_at: "", last_reported_by: "" };
    const cur = await repo.get("currentStatus", projectId, { fresh: true });
    try {
      if (!cur) return await repo.insert("currentStatus", { project_id: projectId, ...patch }, by);
      return await repo.update("currentStatus", projectId, cur.version, patch, by);
    } catch (e) {
      if (e instanceof ConflictError || (e instanceof AppError && e.code === "duplicate")) continue;
      throw e;
    }
  }
  throw new AppError(503, "busy", "อัปเดตสถานะโครงการไม่สำเร็จ ลองใหม่อีกครั้ง");
}

async function maybeAlert(project: Project, prev: CurrentStatus | null | undefined, now: CurrentStatus) {
  const was = prev?.level ?? "normal";
  if (LEVEL_RANK[now.level] > LEVEL_RANK[was] && LEVEL_RANK[now.level] >= LEVEL_RANK.warning) {
    await notifyProject(project.project_id, levelAlertText(project.name, now.level, now.water_level_cm), { includeExecutives: true }).catch((e) => console.error("[notify]", e));
  }
}

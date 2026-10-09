import { listExternalStations } from "../adapters/water";
import { kv } from "../core/kv";
import { repoReady } from "../repo";
import { LEVEL_RANK, LEVEL_TH } from "./levels";
import { notifyProject } from "./notify";
import { audit } from "./audit";

/** แจ้งเตือนโครงการที่เลยรอบรายงาน (ไม่เตือนซ้ำภายในรอบเดียวกัน) */
export async function remindOverdue() {
  const repo = await repoReady();
  const now = Date.now();
  const statuses = new Map((await repo.list("currentStatus", { fresh: true })).map((s) => [s.project_id, s]));
  const sent: string[] = [];
  for (const p of await repo.list("projects")) {
    if (p.status !== "active" || !p.report_interval_hours) continue;
    const last = statuses.get(p.project_id)?.last_reported_at;
    const iv = p.report_interval_hours * 3_600_000;
    if (last && now - new Date(last).getTime() <= iv) continue;
    if (!(await kv().setNx(`remind:${p.project_id}:${Math.floor(now / iv)}`, "1", iv))) continue;
    await notifyProject(p.project_id, `⏰ ถึงเวลารายงานสถานการณ์น้ำของ "${p.name}" แล้ว (รอบทุก ${p.report_interval_hours} ชม.)`);
    sent.push(p.project_id);
  }
  await audit("system", "cron.remind", "project", sent.join(","), "", { count: sent.length });
  return { reminded: sent };
}

/** ดึงข้อมูลหน่วยงานน้ำใหม่ + เตือนเมื่อสถานีที่ผูกกับโครงการถึงระดับเตือนภัยขึ้นไป */
export async function refreshExternal() {
  await kv().del("water:all");
  const all = await listExternalStations();
  const repo = await repoReady();
  const alerts: string[] = [];
  const projects = new Map((await repo.list("projects")).map((p) => [p.project_id, p]));
  for (const l of await repo.list("stations")) {
    const s = all.find((x) => x.station_id === l.station_id);
    const p = projects.get(l.project_id);
    if (!s || !p || s.situation === "unknown") continue;
    if (LEVEL_RANK[s.situation] >= LEVEL_RANK.warning && (await kv().setNx(`ext-alert:${l.link_id}:${s.situation}`, "1", 6 * 3_600_000))) {
      await notifyProject(p.project_id, `🌊 สถานี ${s.name} (${s.station_id}) ระดับ${LEVEL_TH[s.situation]} — กระทบโครงการ ${p.name}`, { includeExecutives: true });
      alerts.push(`${p.project_id}:${s.station_id}`);
    }
  }
  return { stations: all.length, alerts };
}

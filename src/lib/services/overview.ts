import { repoReady } from "../repo";
import type { CurrentStatus, Project } from "../repo/types";
import { visibleProjects, type Actor } from "./access";
import { LEVEL_RANK } from "./levels";
import { listExternalStations, type StationReading } from "../adapters/water";

export interface ProjectCard { project: Project; status: CurrentStatus | null; stations: StationReading[]; overdue: boolean; photoCount: number }

export async function overview(actor: Actor) {
  const repo = await repoReady();
  const projects = await visibleProjects(actor);
  const [statuses, links, photos] = await Promise.all([repo.list("currentStatus"), repo.list("stations"), repo.list("photos")]);
  let ext: StationReading[] = [];
  try { ext = await listExternalStations(); } catch { /* หน่วยงานล่ม: แสดงเฉพาะข้อมูลภายใน */ }
  const sMap = new Map(statuses.map((s) => [s.project_id, s]));
  const extMap = new Map(ext.map((s) => [s.station_id, s]));
  const now = Date.now();
  const cards: ProjectCard[] = projects.map((p) => {
    const st = sMap.get(p.project_id) ?? null;
    const iv = (p.report_interval_hours ?? 0) * 3_600_000;
    const overdue = !!iv && (!st?.last_reported_at || now - new Date(st.last_reported_at).getTime() > iv);
    return {
      project: p, status: st, overdue,
      stations: links.filter((l) => l.project_id === p.project_id).map((l) => extMap.get(l.station_id)).filter((x): x is StationReading => !!x),
      photoCount: photos.filter((x) => x.project_id === p.project_id).length,
    };
  });
  cards.sort((a, b) => LEVEL_RANK[b.status?.level ?? "normal"] - LEVEL_RANK[a.status?.level ?? "normal"] || a.project.name.localeCompare(b.project.name, "th"));
  const counts = { normal: 0, watch: 0, warning: 0, critical: 0 } as Record<string, number>;
  for (const c of cards) counts[c.status?.level ?? "normal"]++;
  return { cards, counts, overdue: cards.filter((c) => c.overdue).length, affectedUnits: cards.reduce((s, c) => s + (c.status?.affected_units ?? 0), 0) };
}

import { assertProjectAccess } from "./access";
import { listReports } from "./reports";
import { listPhotos } from "./photos";
import { others } from "./presence";

export async function projectDetail(actor: Actor, projectId: string) {
  const project = await assertProjectAccess(actor, projectId, "view");
  const repo = await repoReady();
  const [status, reports, photos, links, editors] = await Promise.all([
    repo.get("currentStatus", projectId), listReports(actor, projectId, { includeVoid: true, limit: 100 }),
    listPhotos(actor, projectId), repo.list("stations"), others(actor, projectId),
  ]);
  let ext: StationReading[] = [];
  try { ext = await listExternalStations(); } catch { /* ignore */ }
  const users = new Map((await repo.list("users")).map((u) => [u.user_id, u.display_name]));
  const mine = links.filter((l) => l.project_id === projectId);
  return {
    project, status,
    reports: reports.map((r) => ({ ...r, created_by_name: users.get(r.created_by) ?? r.created_by, updated_by_name: users.get(String(r.updated_by)) ?? r.updated_by })),
    photos: photos.map((p) => ({ photo_id: p.photo_id, report_id: p.report_id, taken_at: p.taken_at, lat: p.lat, lng: p.lng })),
    stations: mine.map((l) => ({ link: l, reading: ext.find((s) => s.station_id === l.station_id) ?? null })),
    editors,
  };
}

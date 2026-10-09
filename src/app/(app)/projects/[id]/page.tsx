import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/core/errors";
import { fmtThaiDateTime } from "@/lib/core/time";
import { getSession } from "@/lib/server/session";
import { projectDetail } from "@/lib/services/overview";
import { canWriteRole, accessMap } from "@/lib/services/access";
import { LevelBadge, Stat, TrendIcon } from "@/components/ui";
import { LevelChart } from "@/components/LevelChart";
import { ReportList } from "@/components/ReportList";
import { ExportButtons } from "@/components/ExportButtons";
import { MapClient } from "@/components/MapClient";
import { LEVEL_TH } from "@/lib/services/levels";
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (s.state !== "active") return null;
  let d;
  try { d = await projectDetail(s.actor, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const canEdit = canWriteRole(s.actor.role) && (await accessMap(s.actor)).get(id) === "edit";
  const { project: p, status: st } = d;
  const photosByReport = new Map<string, string[]>();
  for (const ph of d.photos) photosByReport.set(ph.report_id, [...(photosByReport.get(ph.report_id) ?? []), ph.photo_id]);
  const points = d.reports.filter((r) => r.status === "active" && r.water_level_cm != null).map((r) => ({ at: r.reported_at, cm: r.water_level_cm! })).sort((a, b) => (a.at < b.at ? -1 : 1));
  const items = d.reports.map((r) => ({ ...r, photos: photosByReport.get(r.report_id) ?? [] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><Link href="/" className="text-sm text-brand-600">← ภาพรวม</Link><h1 className="text-xl font-bold">{p.name}</h1><p className="text-sm text-slate-500">{p.address} {p.province} • {p.project_id}</p></div>
        {canEdit && <Link href={`/projects/${id}/report/new`} className="btn-primary">+ รายงานสถานการณ์</Link>}
      </div>
      {d.editors.length > 0 && <div role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300">⚠️ {d.editors.map((e) => e.name).join(", ")} กำลังแก้ไขโครงการนี้อยู่</div>}

      <section className="card space-y-3">
        <div className="flex items-center justify-between"><LevelBadge level={st?.level} className="!text-sm" /><TrendIcon trend={st?.trend} /></div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="ระดับน้ำ (ซม.)" value={st?.water_level_cm ?? "-"} />
          <Stat label="หลังคาได้รับผลกระทบ" value={st?.affected_units ?? 0} />
          <Stat label="รายงานล่าสุด" value={<span className="text-sm">{fmtThaiDateTime(st?.last_reported_at)}</span>} />
        </div>
        <p className="text-xs text-slate-500">เกณฑ์ (ซม.): เฝ้าระวัง {p.threshold_watch_cm ?? "-"} • เตือนภัย {p.threshold_warning_cm ?? "-"} • วิกฤต {p.threshold_critical_cm ?? "-"} • รอบรายงานทุก {p.report_interval_hours ?? "-"} ชม.</p>
      </section>

      <section className="card"><h2 className="mb-2 font-semibold">ระดับน้ำย้อนหลัง</h2><LevelChart points={points} watch={p.threshold_watch_cm} warning={p.threshold_warning_cm} critical={p.threshold_critical_cm} /></section>

      {d.stations.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">ข้อมูลหน่วยงานกลาง (สถานีที่เกี่ยวข้อง)</h2>
          {d.stations.map(({ link, reading }) => (
            <div key={link.link_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <div><div className="font-medium">{reading?.name ?? link.station_name}</div><div className="text-xs text-slate-500">{link.station_id} • {link.river}{reading && ` • ${fmtThaiDateTime(reading.observed_at)}`}{reading?.source === "mock" && " • ข้อมูลจำลอง"}</div></div>
              {reading ? <div className="text-right"><b>{reading.level_m} ม.</b> <span className="text-xs text-slate-500">ตลิ่ง {reading.bank_m ?? "-"} ม.</span>{reading.situation !== "unknown" && <div className="text-xs">{LEVEL_TH[reading.situation]}</div>}</div> : <span className="text-xs text-slate-400">ไม่มีข้อมูล</span>}
            </div>
          ))}
        </section>
      )}

      {p.lat != null && p.lng != null && <MapClient height={220} pins={[{ id: p.project_id, name: p.name, lat: p.lat, lng: p.lng, level: st?.level ?? null, cm: st?.water_level_cm }]} />}

      <section className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">ประวัติรายงาน</h2><ExportButtons project={id} /></div>
        <ReportList projectId={id} items={items} canEdit={canEdit} />
      </section>
    </div>
  );
}

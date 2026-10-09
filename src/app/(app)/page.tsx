import Link from "next/link";
import { fmtThaiDateTime } from "@/lib/core/time";
import { getSession } from "@/lib/server/session";
import { overview } from "@/lib/services/overview";
import { LEVEL_COLOR, LEVEL_TH } from "@/lib/services/levels";
import { listExternalStations } from "@/lib/adapters/water";
import { LevelBadge, Stat, TrendIcon, Empty } from "@/components/ui";
import { MapClient } from "@/components/MapClient";
import { ExportButtons } from "@/components/ExportButtons";
import type { Pin } from "@/components/MapView";
export const dynamic = "force-dynamic";
export const metadata = { title: "ภาพรวม" };

export default async function Home() {
  const s = await getSession();
  if (s.state !== "active") return null;
  const { actor } = s;
  const o = await overview(actor);
  const allStations = await listExternalStations().catch(() => []);
  const linked = new Set(o.cards.flatMap((c) => c.stations.map((x) => x.station_id)));
  const pins: Pin[] = [
    ...o.cards.filter((c) => c.project.lat != null && c.project.lng != null).map((c) => ({ id: c.project.project_id, name: c.project.name, lat: c.project.lat!, lng: c.project.lng!, level: c.status?.level ?? null, cm: c.status?.water_level_cm, href: `/projects/${c.project.project_id}` })),
    ...(actor.role !== "staff" ? allStations.filter((x) => linked.has(x.station_id) && x.lat != null).map((x) => ({ id: "s" + x.station_id, name: x.name, lat: x.lat!, lng: x.lng!, kind: "station" as const, sub: `${x.level_m} ม. • ${x.situation}` })) : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{actor.role === "staff" ? "โครงการของฉัน" : "ภาพรวมสถานการณ์น้ำ"}</h1>
        <ExportButtons />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {(["critical", "warning", "watch", "normal"] as const).map((l) => <Stat key={l} label={LEVEL_TH[l]} value={o.counts[l]} tone={l === "normal" ? "text-green-700" : undefined} />)}
        <Stat label="เลยรอบรายงาน" value={o.overdue} tone={o.overdue ? "text-red-600" : ""} />
        <Stat label="หลังคาได้รับผลกระทบ" value={o.affectedUnits} />
      </div>
      {pins.length > 0 && <MapClient pins={pins} />}
      {o.cards.length === 0 ? <Empty>ยังไม่มีโครงการที่คุณมีสิทธิ์เข้าถึง กรุณาติดต่อผู้ดูแลระบบ</Empty> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {o.cards.map(({ project: p, status: st, overdue, stations }) => (
            <li key={p.project_id}>
              <Link href={`/projects/${p.project_id}`} className="card block border-l-4 transition hover:shadow-md" style={{ borderLeftColor: LEVEL_COLOR[st?.level ?? "normal"] }}>
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{p.name}</div><div className="text-xs text-slate-500">{p.province} • {p.project_id}</div></div>
                  <LevelBadge level={st?.level} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs text-slate-500">ระดับน้ำ</div><div className="text-lg font-bold">{st?.water_level_cm ?? "-"}<span className="text-xs font-normal"> ซม.</span></div></div>
                  <div><div className="text-xs text-slate-500">ผลกระทบ</div><div className="text-lg font-bold">{st?.affected_units ?? 0}<span className="text-xs font-normal"> หลัง</span></div></div>
                  <div className="self-end text-xs"><TrendIcon trend={st?.trend} /></div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500">
                  <span>รายงานล่าสุด {fmtThaiDateTime(st?.last_reported_at)}</span>
                  {overdue && <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">เลยรอบรายงาน</span>}
                </div>
                {stations.length > 0 && actor.role !== "staff" && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    {stations.map((x) => <div key={x.station_id}>🛰 {x.name}: <b>{x.level_m} ม.</b> <span className="text-slate-400">({x.situation})</span></div>)}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { LevelBadge, TrendIcon } from "./ui";
import { fmtThaiDateTime } from "@/lib/core/time";
import type { Level, Trend } from "@/lib/repo/types";

export interface RItem {
  report_id: string; revision: number; reported_at: string; level: Level; water_level_cm: number | null; trend: Trend; affected_areas: string;
  affected_units: number | null; pump_status: string; actions_taken: string; note: string; status: "active" | "void"; created_by_name: string; updated_by_name: string;
  photos: string[];
}

export function ReportList({ projectId, items, canEdit }: { projectId: string; items: RItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [voiding, setVoiding] = useState<RItem | null>(null);
  const [reason, setReason] = useState(""); const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  async function doVoid() {
    if (!voiding) return;
    const r = await fetch(`/api/projects/${projectId}/reports/${voiding.report_id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ base_revision: voiding.revision, reason }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(r.status === 409 ? "รายงานนี้ถูกแก้ไขโดยผู้อื่นแล้ว กรุณารีเฟรชแล้วลองใหม่" : j.message ?? "ไม่สำเร็จ"); return; }
    setVoiding(null); setReason(""); setErr(null); router.refresh();
  }

  if (!items.length) return <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีรายงาน</p>;
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {items.map((r) => (
          <li key={r.report_id} className={`py-3 ${r.status === "void" ? "opacity-50" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={r.level} /><span className="font-semibold">{r.water_level_cm ?? "-"} ซม.</span><TrendIcon trend={r.trend} />
              {r.status === "void" && <span className="rounded bg-slate-200 px-1.5 text-xs">ยกเลิกแล้ว</span>}
              {r.revision > 1 && <span className="rounded bg-blue-50 px-1.5 text-xs text-blue-700">แก้ไข rev.{r.revision}</span>}
            </div>
            <div className="mt-1 text-xs text-slate-500">{fmtThaiDateTime(r.reported_at)} • โดย {r.created_by_name}{r.updated_by_name !== r.created_by_name && ` • แก้ไขโดย ${r.updated_by_name}`}</div>
            <div className="mt-1 space-y-0.5 text-sm text-slate-700">
              {r.affected_areas && <div>พื้นที่: {r.affected_areas}{r.affected_units ? ` (${r.affected_units} หลัง)` : ""}</div>}
              {r.pump_status && <div>เครื่องสูบน้ำ: {r.pump_status}</div>}
              {r.actions_taken && <div>ดำเนินการ: {r.actions_taken}</div>}
              {r.note && <div className="text-slate-500">{r.note}</div>}
            </div>
            {r.photos.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {r.photos.map((id) => /* eslint-disable-next-line @next/next/no-img-element */ <button key={id} onClick={() => setZoom(id)} aria-label="ดูรูปขนาดเต็ม"><img src={`/api/photos/${id}/thumb`} alt="รูปประกอบรายงาน" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" /></button>)}
              </div>
            )}
            {canEdit && r.status === "active" && (
              <div className="mt-2 flex gap-2 text-sm">
                <Link href={`/projects/${projectId}/report/${r.report_id}`} className="btn-ghost !min-h-9 !px-3">แก้ไข</Link>
                <button className="btn-ghost !min-h-9 !px-3 text-red-700" onClick={() => { setVoiding(r); setErr(null); }}>ยกเลิกรายงาน</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {voiding && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4">
            <h3 className="font-bold">ยกเลิกรายงาน</h3>
            <p className="text-sm text-slate-600">รายงานจะถูกทำเครื่องหมาย void (ไม่ลบข้อมูล) และสถานะโครงการจะย้อนไปใช้รายงานก่อนหน้า</p>
            <textarea className="input" rows={3} placeholder="เหตุผล (จำเป็น)" value={reason} onChange={(e) => setReason(e.target.value)} />
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setVoiding(null)}>ปิด</button><button className="btn-danger" disabled={reason.trim().length < 3} onClick={doVoid}>ยืนยันยกเลิก</button></div>
          </div>
        </div>
      )}
      {zoom && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${zoom}/full`} alt="รูปขนาดเต็ม" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConflictDialog, type FieldDef } from "./ConflictDialog";
import { PresenceBanner, usePresence } from "./usePresence";
import { LEVELS, LEVEL_TH, TREND_TH, levelFromCm } from "@/lib/services/levels";
import { fromLocalInput, toLocalInput } from "@/lib/core/time";
import type { Level, Report, Trend } from "@/lib/repo/types";

interface Th { threshold_watch_cm: number | null; threshold_warning_cm: number | null; threshold_critical_cm: number | null }
type Draft = Record<string, string>;

const FIELDS: FieldDef[] = [
  { key: "reported_at", label: "เวลาที่รายงาน", format: (v) => String(v).replace("T", " ") },
  { key: "water_level_cm", label: "ระดับน้ำ (ซม.)" }, { key: "level", label: "ระดับสถานการณ์", format: (v) => LEVEL_TH[v as Level] ?? String(v || "—") },
  { key: "gauge_point", label: "จุดวัด" }, { key: "trend", label: "แนวโน้ม", format: (v) => TREND_TH[v as Trend] ?? "—" },
  { key: "affected_areas", label: "พื้นที่ได้รับผลกระทบ" }, { key: "affected_units", label: "หลังคาที่ได้รับผลกระทบ" },
  { key: "pump_status", label: "เครื่องสูบน้ำ" }, { key: "actions_taken", label: "การดำเนินการ" }, { key: "note", label: "หมายเหตุ" },
];

const fromReport = (r: Report): Draft => ({
  reported_at: toLocalInput(r.reported_at), water_level_cm: r.water_level_cm?.toString() ?? "", level: r.level, gauge_point: r.gauge_point ?? "", trend: r.trend ?? "",
  affected_areas: r.affected_areas ?? "", affected_units: r.affected_units?.toString() ?? "", pump_status: r.pump_status ?? "", actions_taken: r.actions_taken ?? "", note: r.note ?? "",
});

export function ReportForm({ projectId, projectName, gaugePoint, thresholds, existing, existingPhotos = [] }: {
  projectId: string; projectName: string; gaugePoint: string; thresholds: Th; existing?: Report; existingPhotos?: string[];
}) {
  const router = useRouter();
  const editors = usePresence(projectId);
  const [rev, setRev] = useState(existing?.revision ?? 0);
  const [d, setD] = useState<Draft>(() => existing ? fromReport(existing) : { reported_at: toLocalInput(), water_level_cm: "", level: "", gauge_point: gaugePoint, trend: "", affected_areas: "", affected_units: "", pump_status: "", actions_taken: "", note: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Record<string, unknown> | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { // พิกัดแนบกับรายงาน (ขออนุญาตเฉพาะเมื่อเริ่มรายงานใหม่)
    if (existing || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => setGeo({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }), () => undefined, { timeout: 8000, maximumAge: 60_000 });
  }, [existing]);

  const suggested = useMemo(() => levelFromCm(d.water_level_cm === "" ? null : Number(d.water_level_cm), thresholds), [d.water_level_cm, thresholds]);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const payload = (x: Draft) => ({
    reported_at: x.reported_at ? fromLocalInput(x.reported_at) : undefined,
    water_level_cm: x.water_level_cm, level: x.level || (suggested ?? undefined), gauge_point: x.gauge_point, trend: x.trend || undefined,
    affected_areas: x.affected_areas, affected_units: x.affected_units, pump_status: x.pump_status, actions_taken: x.actions_taken, note: x.note,
    lat: existing?.lat ?? geo?.lat ?? "", lng: existing?.lng ?? geo?.lng ?? "",
  });

  async function uploadPhotos(reportId: string) {
    for (const f of files) {
      const small = await shrink(f);
      const fd = new FormData();
      fd.set("file", small, "photo.jpg"); fd.set("taken_at", new Date(f.lastModified || Date.now()).toISOString());
      if (geo) { fd.set("lat", String(geo.lat)); fd.set("lng", String(geo.lng)); }
      const r = await fetch(`/api/projects/${projectId}/reports/${reportId}/photos`, { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "อัปโหลดรูปไม่สำเร็จ");
    }
  }

  async function submit(over?: { draft: Draft; revision: number }) {
    setBusy(true); setErr(null);
    try {
      const x = over?.draft ?? d, baseRev = over?.revision ?? rev;
      const res = existing
        ? await fetch(`/api/projects/${projectId}/reports/${existing.report_id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ base_revision: baseRev, data: payload(x) }) })
        : await fetch(`/api/projects/${projectId}/reports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(x)) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.current) { setConflict(j.current); setBusy(false); return; }
      if (!res.ok) throw new Error(j.message ?? "บันทึกไม่สำเร็จ");
      try { await uploadPhotos(j.report_id); } catch (e) { setErr(`บันทึกรายงานแล้ว แต่รูปบางส่วนอัปโหลดไม่สำเร็จ: ${(e as Error).message}`); setBusy(false); router.refresh(); return; }
      router.push(`/projects/${projectId}`); router.refresh();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
      <PresenceBanner editors={editors} />
      <div className="card space-y-3">
        <h2 className="font-semibold">{existing ? `แก้ไขรายงาน (จะสร้าง revision ${rev + 1})` : "รายงานใหม่"} — {projectName}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="at">เวลาที่รายงาน</label><input id="at" type="datetime-local" required className="input" value={d.reported_at} onChange={(e) => set("reported_at", e.target.value)} /></div>
          <div><label className="label" htmlFor="gp">จุดวัดระดับน้ำ</label><input id="gp" className="input" value={d.gauge_point} onChange={(e) => set("gauge_point", e.target.value)} /></div>
          <div><label className="label" htmlFor="cm">ระดับน้ำ (ซม.)</label><input id="cm" inputMode="decimal" type="number" step="0.1" className="input" value={d.water_level_cm} onChange={(e) => set("water_level_cm", e.target.value)} placeholder="เช่น 135" /></div>
          <div><label className="label" htmlFor="au">หลังคาที่ได้รับผลกระทบ</label><input id="au" inputMode="numeric" type="number" min={0} className="input" value={d.affected_units} onChange={(e) => set("affected_units", e.target.value)} /></div>
        </div>
        <div>
          <span className="label">ระดับสถานการณ์ {suggested && !d.level && <span className="font-normal text-slate-500">(ระบบแนะนำ: {LEVEL_TH[suggested]})</span>}</span>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="ระดับสถานการณ์">
            {LEVELS.map((l) => {
              const on = (d.level || suggested) === l;
              const c = { normal: "bg-green-600", watch: "bg-yellow-500", warning: "bg-orange-500", critical: "bg-red-600" }[l];
              return <button type="button" key={l} role="radio" aria-checked={on} onClick={() => set("level", l)} className={`min-h-12 rounded-xl text-sm font-medium ring-1 ${on ? `${c} text-white ring-transparent` : "bg-white text-slate-700 ring-slate-300"}`}>{LEVEL_TH[l]}</button>;
            })}
          </div>
        </div>
        <div>
          <span className="label">แนวโน้ม</span>
          <div className="grid grid-cols-3 gap-2">
            {(["rising", "steady", "falling"] as const).map((t) => <button type="button" key={t} onClick={() => set("trend", t)} className={`min-h-11 rounded-xl text-sm ring-1 ${d.trend === t ? "bg-brand-600 text-white ring-transparent" : "bg-white ring-slate-300"}`}>{t === "rising" ? "▲ " : t === "falling" ? "▼ " : "■ "}{TREND_TH[t]}</button>)}
          </div>
        </div>
        <div><label className="label" htmlFor="aa">พื้นที่ได้รับผลกระทบ</label><input id="aa" className="input" value={d.affected_areas} onChange={(e) => set("affected_areas", e.target.value)} placeholder="เช่น ซอย 3-4" /></div>
        <div><label className="label" htmlFor="pm">เครื่องสูบน้ำ</label><input id="pm" className="input" value={d.pump_status} onChange={(e) => set("pump_status", e.target.value)} placeholder="เช่น เดินเครื่อง 2/3 ตัว" /></div>
        <div><label className="label" htmlFor="ac">การดำเนินการ</label><textarea id="ac" rows={2} className="input" value={d.actions_taken} onChange={(e) => set("actions_taken", e.target.value)} /></div>
        <div><label className="label" htmlFor="nt">หมายเหตุ</label><textarea id="nt" rows={2} className="input" value={d.note} onChange={(e) => set("note", e.target.value)} /></div>
        {geo && <p className="text-xs text-slate-500">📍 แนบพิกัด {geo.lat}, {geo.lng}</p>}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold">รูปถ่าย</h3><button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>📷 ถ่าย/เลือกรูป</button></div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; setFiles((f) => [...f, ...picked].slice(0, 10)); }} />
        {existingPhotos.length + previews.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีรูป (แนบได้สูงสุด 10 รูป)</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {existingPhotos.map((id) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={id} src={`/api/photos/${id}/thumb`} alt="รูปเดิม" className="aspect-square rounded-lg object-cover" />)}
          {previews.map((u, i) => (
            <div key={u} className="relative">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt={`รูปใหม่ ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              <button type="button" aria-label="ลบรูป" className="absolute right-1 top-1 h-7 w-7 rounded-full bg-black/60 text-white" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}>×</button></div>
          ))}
        </div>
      </div>

      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <div className="sticky bottom-16 z-10 flex gap-2 md:bottom-2">
        <button type="button" className="btn-ghost flex-1" onClick={() => router.back()}>ยกเลิก</button>
        <button className="btn-primary flex-[2]" disabled={busy}>{busy ? "กำลังบันทึก…" : existing ? "บันทึกการแก้ไข" : "ส่งรายงาน"}</button>
      </div>

      {conflict && existing && (
        <ConflictDialog fields={FIELDS} mine={d} latest={fromReport(conflict as unknown as Report)} onCancel={() => setConflict(null)}
          onResolve={(merged) => { const latestRev = Number((conflict as { revision: number }).revision); setD(merged as Draft); setRev(latestRev); setConflict(null); submit({ draft: merged as Draft, revision: latestRev }); }} />
      )}
    </form>
  );
}

/** ย่อรูปฝั่ง client ก่อนอัปโหลด (ประหยัดเน็ตมือถือ) ; ล้มเหลวให้ส่งไฟล์เดิม */
async function shrink(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.85));
  } catch { return f; }
}

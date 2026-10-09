"use client";
import { useState } from "react";

export interface FieldDef { key: string; label: string; format?: (v: unknown) => string }

/** หน้าเปรียบเทียบเมื่อชน version (409): เลือกรายฟิลด์ว่าจะใช้ "ของฉัน" หรือ "ล่าสุด" แล้ว merge */
export function ConflictDialog({ fields, mine, latest, onResolve, onCancel }: {
  fields: FieldDef[]; mine: Record<string, unknown>; latest: Record<string, unknown>;
  onResolve: (merged: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const fmt = (f: FieldDef, v: unknown) => (f.format ? f.format(v) : v === null || v === undefined || v === "" ? "—" : String(v));
  const differing = fields.filter((f) => fmt(f, mine[f.key]) !== fmt(f, latest[f.key]));
  const [pick, setPick] = useState<Record<string, "mine" | "latest">>(() => Object.fromEntries(differing.map((f) => [f.key, "mine" as const])));
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cf-title" className="fixed inset-0 z-50 grid place-items-end bg-black/50 p-0 sm:place-items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <h2 id="cf-title" className="text-lg font-bold text-red-700">ข้อมูลถูกแก้ไขโดยผู้อื่นก่อนคุณบันทึก</h2>
        <p className="mb-3 text-sm text-slate-600">เลือกค่าที่ต้องการในแต่ละรายการ แล้วกด “บันทึกที่รวมแล้ว” (ระบบจะบันทึกทับบนเวอร์ชันล่าสุด)</p>
        {differing.length === 0 ? <p className="rounded bg-green-50 p-3 text-sm text-green-800">ไม่มีฟิลด์ที่ต่างกัน — บันทึกต่อได้เลย</p> : (
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_1fr_1fr] gap-2 text-xs font-semibold text-slate-500 sm:grid"><div>รายการ</div><div>ของฉัน</div><div>ล่าสุดในระบบ</div></div>
            {differing.map((f) => (
              <div key={f.key} className="grid gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_1fr_1fr]">
                <div className="text-sm font-medium">{f.label}</div>
                {(["mine", "latest"] as const).map((side) => (
                  <label key={side} className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm ring-1 ${pick[f.key] === side ? "bg-brand-50 ring-brand-500" : "ring-slate-200"}`}>
                    <input type="radio" name={`cf-${f.key}`} checked={pick[f.key] === side} onChange={() => setPick({ ...pick, [f.key]: side })} className="mt-1" />
                    <span><span className="block text-xs text-slate-500 sm:hidden">{side === "mine" ? "ของฉัน" : "ล่าสุด"}</span>{fmt(f, (side === "mine" ? mine : latest)[f.key])}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>ยกเลิก</button>
          <button className="btn-primary" onClick={() => onResolve({ ...latest, ...Object.fromEntries(differing.filter((f) => pick[f.key] === "mine").map((f) => [f.key, mine[f.key]])) })}>บันทึกที่รวมแล้ว</button>
        </div>
      </div>
    </div>
  );
}

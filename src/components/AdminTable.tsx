"use client";
import { useCallback, useEffect, useState } from "react";
import { ConflictDialog, type FieldDef } from "./ConflictDialog";

export interface AField { key: string; label: string; type?: "text" | "number" | "select" | "date"; options?: Array<{ value: string; label: string }>; required?: boolean; createOnly?: boolean; list?: boolean; help?: string }
type Row = Record<string, unknown> & { version: number };

export function AdminTable({ table, title, fields, idKey, lookups = {} }: { table: string; title: string; fields: AField[]; idKey: string; lookups?: Record<string, Record<string, string>> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState<{ row: Row | null; draft: Record<string, unknown> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Record<string, unknown> | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/${table}`); if (r.ok) setRows(await r.json()); else setErr((await r.json()).message);
  }, [table]);
  useEffect(() => { load(); }, [load]);

  const show = (f: AField, v: unknown) => (f.type === "select" ? f.options?.find((o) => o.value === v)?.label ?? String(v ?? "") : String(v ?? ""));
  const shown = (rows ?? []).filter((r) => !q || fields.some((f) => show(f, r[f.key]).toLowerCase().includes(q.toLowerCase())));
  const cols = fields.filter((f) => f.list !== false).slice(0, 6);

  async function save(draft: Record<string, unknown>, version?: number) {
    setErr(null);
    const row = edit?.row;
    const res = row
      ? await fetch(`/api/admin/${table}/${encodeURIComponent(String(row[idKey]))}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: version ?? row.version, data: draft }) })
      : await fetch(`/api/admin/${table}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    const j = await res.json().catch(() => ({}));
    if (res.status === 409 && j.current) { setConflict(j.current); return; }
    if (!res.ok) { setErr(j.message ?? "บันทึกไม่สำเร็จ"); return; }
    setEdit(null); setConflict(null); load();
  }
  async function remove(row: Row) {
    if (!confirm(table === "users" ? "ปิดบัญชีผู้ใช้นี้ (มีผลทันที)?" : table === "projects" ? "เก็บโครงการนี้เข้าคลัง (archive)?" : "ลบรายการนี้?")) return;
    const res = await fetch(`/api/admin/${table}/${encodeURIComponent(String(row[idKey]))}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: row.version }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(res.status === 409 ? "ข้อมูลถูกแก้ไขโดยผู้อื่น กรุณารีเฟรชแล้วลองใหม่" : j.message ?? "ไม่สำเร็จ"); return; }
    load();
  }

  const conflictFields: FieldDef[] = fields.map((f) => ({ key: f.key, label: f.label, format: (v) => (v === null || v === undefined || v === "" ? "—" : show(f, v)) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{title}</h2><input className="input ml-auto max-w-56" placeholder="ค้นหา…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
        <button className="btn-primary" onClick={() => setEdit({ row: null, draft: Object.fromEntries(fields.filter((f) => f.type === "select" && f.options?.length).map((f) => [f.key, f.options![0].value])) })}>+ เพิ่ม</button></div>
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr>{cols.map((f) => <th key={f.key} className="px-3 py-2 font-medium">{f.label}</th>)}<th className="px-3 py-2" /></tr></thead>
          <tbody>
            {rows === null && <tr><td className="p-4 text-slate-400" colSpan={cols.length + 1}>กำลังโหลด…</td></tr>}
            {shown.map((r) => (
              <tr key={String(r[idKey])} className="border-t border-slate-100">
                {cols.map((f) => <td key={f.key} className="max-w-56 truncate px-3 py-2">{lookups[f.key]?.[String(r[f.key])] ?? show(f, r[f.key])}</td>)}
                <td className="whitespace-nowrap px-3 py-2 text-right"><button className="btn-ghost !min-h-8 !px-3" onClick={() => setEdit({ row: r, draft: { ...r } })}>แก้ไข</button> <button className="btn-ghost !min-h-8 !px-3 text-red-700" onClick={() => remove(r)}>{table === "users" ? "ปิดบัญชี" : table === "projects" ? "เก็บ" : "ลบ"}</button></td>
              </tr>
            ))}
            {rows && shown.length === 0 && <tr><td className="p-4 text-center text-slate-400" colSpan={cols.length + 1}>ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 grid place-items-end bg-black/50 sm:place-items-center sm:p-4">
          <form onSubmit={(e) => { e.preventDefault(); save(edit.draft); }} className="max-h-[92dvh] w-full max-w-xl space-y-3 overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <h3 className="text-lg font-bold">{edit.row ? "แก้ไข" : "เพิ่ม"}{title}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.filter((f) => !(f.createOnly && edit.row)).map((f) => (
                <div key={f.key} className={f.type === "text" || !f.type ? "sm:col-span-1" : ""}>
                  <label className="label" htmlFor={`f-${f.key}`}>{f.label}{f.required && " *"}</label>
                  {f.type === "select" ? (
                    <select id={`f-${f.key}`} className="input" required={f.required} value={String(edit.draft[f.key] ?? "")} onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, [f.key]: e.target.value } })}>
                      {!f.required && <option value="">—</option>}{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : <input id={`f-${f.key}`} className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step="any" required={f.required} value={String(edit.draft[f.key] ?? "")} onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, [f.key]: e.target.value } })} />}
                  {f.help && <p className="mt-0.5 text-xs text-slate-500">{f.help}</p>}
                </div>
              ))}
            </div>
            {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => { setEdit(null); setErr(null); }}>ยกเลิก</button><button className="btn-primary">บันทึก</button></div>
          </form>
        </div>
      )}
      {conflict && edit?.row && (
        <ConflictDialog fields={conflictFields} mine={edit.draft} latest={conflict} onCancel={() => { setConflict(null); setEdit(null); load(); }}
          onResolve={(merged) => { setEdit({ ...edit, draft: merged }); save(merged, Number((conflict as { version: number }).version)); }} />
      )}
    </div>
  );
}

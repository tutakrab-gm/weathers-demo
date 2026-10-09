"use client";
import { useState } from "react";
export function ExportButtons({ project }: { project?: string }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const href = (f: string) => { const q = new URLSearchParams({ format: f }); if (project) q.set("project", project); if (from) q.set("from", from); if (to) q.set("to", to); return `/api/export?${q}`; };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div><label className="label text-xs" htmlFor="xf">ตั้งแต่</label><input id="xf" type="date" className="input !min-h-9 !py-1 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div><label className="label text-xs" htmlFor="xt">ถึง</label><input id="xt" type="date" className="input !min-h-9 !py-1 text-sm" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <a className="btn-ghost !min-h-9" href={href("xlsx")}>⬇ Excel</a>
      <a className="btn-ghost !min-h-9" href={href("pdf")}>⬇ PDF</a>
    </div>
  );
}

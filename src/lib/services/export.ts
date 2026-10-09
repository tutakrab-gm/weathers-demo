import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { repoReady } from "../repo";
import { visibleProjects, type Actor } from "./access";
import { LEVEL_TH, TREND_TH, LEVEL_COLOR } from "./levels";
import { latestRevisions } from "./reports";
import { fmtThaiDate, fmtThaiDateTime } from "../core/time";
import { badRequest } from "../core/errors";

export interface ExportOpts { projectIds?: string[]; from?: string; to?: string }

async function collect(actor: Actor, o: ExportOpts) {
  const repo = await repoReady();
  let projects = await visibleProjects(actor); // จำกัดตามสิทธิ์เสมอ
  if (o.projectIds?.length) projects = projects.filter((p) => o.projectIds!.includes(p.project_id));
  if (!projects.length) throw badRequest("ไม่พบโครงการที่มีสิทธิ์ส่งออก");
  const ids = new Set(projects.map((p) => p.project_id));
  const users = new Map((await repo.list("users")).map((u) => [u.user_id, u.display_name]));
  const status = new Map((await repo.list("currentStatus")).map((s) => [s.project_id, s]));
  const photos = await repo.list("photos");
  const reports = latestRevisions((await repo.list("reports")).filter((r) => ids.has(r.project_id)))
    .filter((r) => r.status === "active" && (!o.from || r.reported_at >= o.from) && (!o.to || r.reported_at <= o.to))
    .sort((a, b) => (a.reported_at < b.reported_at ? 1 : -1));
  return { projects, reports, users, status, photoCount: (id: string) => photos.filter((p) => p.report_id === id).length };
}

export async function exportXlsx(actor: Actor, o: ExportOpts): Promise<Buffer> {
  const d = await collect(actor, o);
  const wb = new ExcelJS.Workbook();
  wb.creator = "ระบบติดตามสถานการณ์น้ำ"; wb.created = new Date();
  const s1 = wb.addWorksheet("สรุปโครงการ");
  s1.columns = [
    { header: "รหัส", key: "id", width: 10 }, { header: "โครงการ", key: "name", width: 36 }, { header: "จังหวัด", key: "prov", width: 18 },
    { header: "สถานการณ์", key: "lv", width: 12 }, { header: "ระดับน้ำ (ซม.)", key: "cm", width: 14 }, { header: "แนวโน้ม", key: "tr", width: 18 },
    { header: "หลังคาที่ได้รับผลกระทบ", key: "au", width: 22 }, { header: "รายงานล่าสุด", key: "at", width: 24 },
  ];
  for (const p of d.projects) {
    const st = d.status.get(p.project_id);
    s1.addRow({ id: p.project_id, name: p.name, prov: p.province, lv: st ? LEVEL_TH[st.level] : "-", cm: st?.water_level_cm ?? "", tr: st ? TREND_TH[st.trend] : "", au: st?.affected_units ?? "", at: fmtThaiDateTime(st?.last_reported_at) });
  }
  const s2 = wb.addWorksheet("รายงาน");
  s2.columns = [
    { header: "เวลารายงาน (พ.ศ.)", key: "at", width: 24 }, { header: "โครงการ", key: "p", width: 32 }, { header: "สถานการณ์", key: "lv", width: 12 },
    { header: "ระดับน้ำ (ซม.)", key: "cm", width: 14 }, { header: "จุดวัด", key: "g", width: 20 }, { header: "แนวโน้ม", key: "tr", width: 16 },
    { header: "พื้นที่ได้รับผลกระทบ", key: "aa", width: 28 }, { header: "ผลกระทบ (หลัง)", key: "au", width: 14 }, { header: "เครื่องสูบน้ำ", key: "pump", width: 22 },
    { header: "การดำเนินการ", key: "act", width: 32 }, { header: "หมายเหตุ", key: "note", width: 32 }, { header: "ผู้รายงาน", key: "by", width: 22 },
    { header: "จำนวนรูป", key: "ph", width: 10 }, { header: "revision", key: "rev", width: 9 },
  ];
  const pname = new Map(d.projects.map((p) => [p.project_id, p.name]));
  for (const r of d.reports) {
    s2.addRow({ at: fmtThaiDateTime(r.reported_at), p: pname.get(r.project_id), lv: LEVEL_TH[r.level], cm: r.water_level_cm ?? "", g: r.gauge_point, tr: TREND_TH[r.trend], aa: r.affected_areas, au: r.affected_units ?? "", pump: r.pump_status, act: r.actions_taken, note: r.note, by: d.users.get(r.created_by) ?? r.created_by, ph: d.photoCount(r.report_id), rev: r.revision });
  }
  for (const ws of [s1, s2]) { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }; }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------------- PDF (ฟอนต์ไทยฝังจาก assets/fonts) ---------------- */
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const isThai = (c: string) => /[฀-๿]/.test(c);

interface Fonts { thai: PDFFont; latin: PDFFont; thaiB: PDFFont; latinB: PDFFont }
function runs(text: string): Array<{ s: string; thai: boolean }> {
  const out: Array<{ s: string; thai: boolean }> = [];
  for (const ch of text) {
    const t = isThai(ch);
    // วรรณยุกต์/สระประกอบอยู่ในช่วงไทยอยู่แล้ว ช่องว่างและเครื่องหมายให้ติดกับ run ปัจจุบัน
    const spaceLike = /[\s.,:;()\-/%+]/.test(ch);
    const last = out[out.length - 1];
    if (last && (last.thai === t || (spaceLike && !t))) last.s += ch;
    else out.push({ s: ch, thai: t });
  }
  return out;
}
function width(text: string, f: Fonts, size: number, bold = false) {
  return runs(text).reduce((w, r) => w + (r.thai ? (bold ? f.thaiB : f.thai) : bold ? f.latinB : f.latin).widthOfTextAtSize(safe(r.s, r.thai ? f.thai : f.latin), size), 0);
}
function safe(s: string, font: PDFFont) {
  const cps = font.getCharacterSet();
  return [...s].map((c) => (cps.includes(c.codePointAt(0)!) ? c : " ")).join("");
}
function draw(page: PDFPage, text: string, x: number, y: number, f: Fonts, size: number, o: { bold?: boolean; color?: [number, number, number] } = {}) {
  let cx = x;
  for (const r of runs(text)) {
    const font = r.thai ? (o.bold ? f.thaiB : f.thai) : o.bold ? f.latinB : f.latin;
    const s = safe(r.s, font);
    page.drawText(s, { x: cx, y, size, font, color: o.color ? rgb(...o.color) : rgb(0.1, 0.1, 0.1) });
    cx += font.widthOfTextAtSize(s, size);
  }
}
function fit(text: string, maxW: number, f: Fonts, size: number) {
  let t = (text ?? "").replace(/\s+/g, " ");
  if (width(t, f, size) <= maxW) return t;
  while (t.length > 1 && width(t + "…", f, size) > maxW) t = t.slice(0, -1);
  return t + "…";
}
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

export async function exportPdf(actor: Actor, o: ExportOpts): Promise<Buffer> {
  const d = await collect(actor, o);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const ld = (n: string) => fs.readFileSync(path.join(FONT_DIR, n));
  const f: Fonts = {
    thai: await doc.embedFont(ld("noto-sans-thai-thai-400-normal.woff"), { subset: true }),
    thaiB: await doc.embedFont(ld("noto-sans-thai-thai-700-normal.woff"), { subset: true }),
    latin: await doc.embedFont(ld("noto-sans-thai-latin-400-normal.woff"), { subset: true }),
    latinB: await doc.embedFont(ld("noto-sans-thai-latin-700-normal.woff"), { subset: true }),
  };
  const W = 842, H = 595, M = 36; // A4 แนวนอน
  let page = doc.addPage([W, H]);
  let y = H - M;
  const heading = (t: string) => { draw(page, t, M, y, f, 14, { bold: true }); y -= 22; };
  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([W, H]); y = H - M; } };

  draw(page, "รายงานสถานการณ์น้ำ", M, y, f, 20, { bold: true }); y -= 20;
  draw(page, `ออกรายงาน ${fmtThaiDateTime(new Date())}  |  ช่วง ${o.from ? fmtThaiDate(o.from) : "ทั้งหมด"} – ${o.to ? fmtThaiDate(o.to) : "ปัจจุบัน"}  |  โดย ${actor.display_name}`, M, y, f, 9, { color: [0.4, 0.4, 0.4] }); y -= 24;

  heading("สรุปรายโครงการ");
  const cols = [{ t: "โครงการ", w: 230 }, { t: "จังหวัด", w: 100 }, { t: "สถานการณ์", w: 80 }, { t: "ระดับน้ำ (ซม.)", w: 90 }, { t: "แนวโน้ม", w: 110 }, { t: "รายงานล่าสุด", w: 150 }];
  const row = (cells: string[], bold = false, colors?: Array<[number, number, number] | undefined>) => {
    ensure(16);
    let x = M;
    cells.forEach((c, i) => { draw(page, fit(c, cols[i].w - 6, f, 9), x, y, f, 9, { bold, color: colors?.[i] }); x += cols[i].w; });
    y -= 15;
  };
  row(cols.map((c) => c.t), true);
  page.drawLine({ start: { x: M, y: y + 11 }, end: { x: W - M, y: y + 11 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  for (const p of d.projects) {
    const st = d.status.get(p.project_id);
    row([p.name, p.province, st ? LEVEL_TH[st.level] : "-", String(st?.water_level_cm ?? "-"), st ? TREND_TH[st.trend] : "-", fmtThaiDateTime(st?.last_reported_at)], false, [undefined, undefined, st ? hex(LEVEL_COLOR[st.level]) : undefined]);
  }
  y -= 14; ensure(40);
  heading(`รายงานล่าสุด (${Math.min(d.reports.length, 60)} จาก ${d.reports.length} รายการ)`);
  const pname = new Map(d.projects.map((p) => [p.project_id, p.name]));
  const c2 = [{ t: "เวลา", w: 120 }, { t: "โครงการ", w: 170 }, { t: "สถานการณ์", w: 70 }, { t: "ซม.", w: 45 }, { t: "ผู้รายงาน", w: 110 }, { t: "หมายเหตุ/การดำเนินการ", w: 250 }];
  const row2 = (cells: string[], bold = false) => { ensure(16); let x = M; cells.forEach((c, i) => { draw(page, fit(c, c2[i].w - 6, f, 8.5), x, y, f, 8.5, { bold }); x += c2[i].w; }); y -= 14; };
  row2(c2.map((c) => c.t), true);
  for (const r of d.reports.slice(0, 60)) row2([fmtThaiDateTime(r.reported_at), pname.get(r.project_id) ?? "", LEVEL_TH[r.level], String(r.water_level_cm ?? "-"), d.users.get(r.created_by) ?? "", [r.actions_taken, r.note].filter(Boolean).join(" / ")]);
  return Buffer.from(await doc.save());
}

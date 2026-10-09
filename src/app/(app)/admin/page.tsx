import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { repoReady } from "@/lib/repo";
import { fmtThaiDateTime } from "@/lib/core/time";
export const dynamic = "force-dynamic";
export const metadata = { title: "จัดการระบบ" };

const MENU = [
  { href: "/admin/users", t: "ผู้ใช้", d: "เพิ่ม/แก้ไข/ปิดบัญชี (มีผลทันที)", i: "👤" },
  { href: "/admin/access", t: "สิทธิ์ตามโครงการ", d: "view/edit พร้อมวันเริ่ม-สิ้นสุด", i: "🔑" },
  { href: "/admin/projects", t: "โครงการและเกณฑ์ระดับน้ำ", d: "เกณฑ์เฝ้าระวัง/เตือนภัย/วิกฤต รอบรายงาน", i: "🏘️" },
  { href: "/admin/stations", t: "ผูกสถานีภายนอก", d: "เชื่อมโครงการกับสถานีของหน่วยงานน้ำ", i: "🛰️" },
];

export default async function AdminHome() {
  const s = await getSession();
  if (s.state !== "active" || s.user.role !== "admin") redirect("/");
  const logs = (await (await repoReady()).list("audit")).sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1)).slice(0, 15);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">จัดการระบบ</h1>
      <div className="grid gap-3 sm:grid-cols-2">{MENU.map((m) => <Link key={m.href} href={m.href} className="card flex gap-3 hover:shadow-md"><span className="text-2xl">{m.i}</span><div><div className="font-semibold">{m.t}</div><div className="text-sm text-slate-500">{m.d}</div></div></Link>)}</div>
      <section className="card"><h2 className="mb-2 font-semibold">กิจกรรมล่าสุด (Audit log)</h2>
        <ul className="divide-y divide-slate-100 text-sm">{logs.map((l) => <li key={String(l.log_id)} className="flex flex-wrap justify-between gap-2 py-1.5"><span><code className="rounded bg-slate-100 px-1">{String(l.action)}</code> {String(l.entity)}/{String(l.entity_id).slice(0, 24)}</span><span className="text-xs text-slate-500">{String(l.user_id)} • {fmtThaiDateTime(String(l.at))}</span></li>)}</ul></section>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminTable, type AField } from "@/components/AdminTable";
import { getSession } from "@/lib/server/session";
import { repoReady } from "@/lib/repo";
export const dynamic = "force-dynamic";

export default async function AdminTablePage({ params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const s = await getSession();
  if (s.state !== "active" || s.user.role !== "admin") redirect("/");
  const repo = await repoReady();
  const users = await repo.list("users"), projects = await repo.list("projects");
  const uOpt = users.map((u) => ({ value: u.user_id, label: `${u.display_name} (${u.email || u.line_user_id})` }));
  const pOpt = projects.map((p) => ({ value: p.project_id, label: `${p.project_id} — ${p.name}` }));
  const uMap = Object.fromEntries(uOpt.map((o) => [o.value, o.label])), pMap = Object.fromEntries(pOpt.map((o) => [o.value, o.label]));
  const roleOpt = [["staff", "เจ้าหน้าที่โครงการ"], ["manager", "ผู้จัดการ"], ["executive", "ผู้บริหาร"], ["admin", "ผู้ดูแลระบบ"]].map(([value, label]) => ({ value, label }));

  const cfg: Record<string, { title: string; idKey: string; fields: AField[]; lookups?: Record<string, Record<string, string>> }> = {
    users: { title: "ผู้ใช้", idKey: "user_id", fields: [
      { key: "display_name", label: "ชื่อที่แสดง", required: true }, { key: "email", label: "อีเมล (Gmail/อีเมลที่ใช้ login)", help: "ต้องมีอีเมลหรือ LINE user ID อย่างน้อยหนึ่งอย่าง" },
      { key: "line_user_id", label: "LINE user ID" }, { key: "role", label: "บทบาท", type: "select", options: roleOpt, required: true },
      { key: "status", label: "สถานะ", type: "select", required: true, options: [{ value: "active", label: "ใช้งาน" }, { value: "disabled", label: "ปิดบัญชี" }, { value: "pending", label: "รออนุมัติ" }] },
      { key: "phone", label: "โทรศัพท์", list: false }, { key: "avatar_url", label: "รูปโปรไฟล์ (URL)", list: false }] },
    access: { title: "สิทธิ์ตามโครงการ", idKey: "id", lookups: { user_id: uMap, project_id: pMap }, fields: [
      { key: "user_id", label: "ผู้ใช้", type: "select", options: uOpt, required: true }, { key: "project_id", label: "โครงการ", type: "select", options: pOpt, required: true },
      { key: "access_level", label: "ระดับสิทธิ์", type: "select", required: true, options: [{ value: "view", label: "ดูอย่างเดียว (view)" }, { value: "edit", label: "แก้ไขได้ (edit)" }] },
      { key: "valid_from", label: "เริ่มมีผล", type: "date" }, { key: "valid_to", label: "สิ้นสุด", type: "date", help: "เว้นว่าง = ไม่มีกำหนด" }] },
    projects: { title: "โครงการ", idKey: "project_id", fields: [
      { key: "project_id", label: "รหัสโครงการ", required: true, createOnly: true, help: "A-Z 0-9 _ -" }, { key: "name", label: "ชื่อโครงการ", required: true }, { key: "province", label: "จังหวัด" },
      { key: "region", label: "ภาค", list: false }, { key: "address", label: "ที่อยู่", list: false }, { key: "lat", label: "ละติจูด", type: "number", list: false }, { key: "lng", label: "ลองจิจูด", type: "number", list: false },
      { key: "units_total", label: "จำนวนหลังทั้งหมด", type: "number", list: false }, { key: "gauge_point", label: "จุดวัดระดับน้ำ", list: false },
      { key: "threshold_watch_cm", label: "เกณฑ์เฝ้าระวัง (ซม.)", type: "number" }, { key: "threshold_warning_cm", label: "เกณฑ์เตือนภัย (ซม.)", type: "number" }, { key: "threshold_critical_cm", label: "เกณฑ์วิกฤต (ซม.)", type: "number" },
      { key: "report_interval_hours", label: "รอบรายงาน (ชม.)", type: "number", list: false },
      { key: "status", label: "สถานะ", type: "select", required: true, options: [{ value: "active", label: "ใช้งาน" }, { value: "archived", label: "เก็บเข้าคลัง" }] }] },
    stations: { title: "สถานีภายนอก", idKey: "link_id", lookups: { project_id: pMap }, fields: [
      { key: "project_id", label: "โครงการ", type: "select", options: pOpt, required: true }, { key: "provider", label: "ผู้ให้บริการ", required: true, help: "เช่น thaiwater" },
      { key: "station_id", label: "รหัสสถานี", required: true, help: "เช่น C.2, CPY010" }, { key: "station_name", label: "ชื่อสถานี" }, { key: "river", label: "แม่น้ำ" }, { key: "note", label: "หมายเหตุ", list: false }] },
  };
  const c = cfg[table];
  if (!c) notFound();
  return (
    <div className="space-y-3">
      <Link href="/admin" className="text-sm text-brand-600">← จัดการระบบ</Link>
      <AdminTable table={table} title={c.title} idKey={c.idKey} fields={c.fields} lookups={c.lookups} />
    </div>
  );
}

import { createReport } from "./reports";
import type { Repository, User } from "../repo/types";
import type { Actor } from "./access";

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

/** ข้อมูลตัวอย่าง (idempotent: ข้ามถ้ามี user อยู่แล้ว) */
export async function seedAll(repo: Repository) {
  if ((await repo.list("users")).length) return { skipped: true };
  const by = "seed";
  const users: Partial<User>[] = [
    { user_id: "u_admin", email: "admin@example.com", display_name: "ผู้ดูแลระบบ", role: "admin", status: "active" },
    { user_id: "u_exec", email: "exec@example.com", display_name: "คุณสมชาย (ผู้บริหาร)", role: "executive", status: "active" },
    { user_id: "u_mgr", email: "manager@example.com", display_name: "คุณวิไล (ผู้จัดการภาค)", role: "manager", status: "active" },
    { user_id: "u_staff1", email: "staff1@example.com", display_name: "คุณประสิทธิ์ (เจ้าหน้าที่ริมน้ำนนท์)", role: "staff", status: "active", phone: "081-111-1111" },
    { user_id: "u_staff2", email: "staff2@example.com", display_name: "คุณมาลี (เจ้าหน้าที่ปทุม)", role: "staff", status: "active", phone: "081-222-2222" },
    { user_id: "u_off", email: "resigned@example.com", display_name: "อดีตเจ้าหน้าที่ (ปิดบัญชี)", role: "staff", status: "disabled" },
  ];
  for (const u of users) await repo.insert("users", { ...u, created_at: new Date().toISOString() }, by);

  const projects = [
    { project_id: "NBR01", name: "ริเวอร์ไซด์ วิลล่า นนทบุรี", address: "ถ.รัตนาธิเบศร์ อ.เมือง", region: "กลาง", province: "นนทบุรี", lat: 13.86, lng: 100.49, units_total: 320, gauge_point: "ท่าน้ำหน้าโครงการ", threshold_watch_cm: 120, threshold_warning_cm: 160, threshold_critical_cm: 200, report_interval_hours: 6 },
    { project_id: "PTH02", name: "การ์เด้นโฮม ปทุมธานี", address: "ถ.ติวานนท์ อ.เมือง", region: "กลาง", province: "ปทุมธานี", lat: 13.99, lng: 100.53, units_total: 210, gauge_point: "คลองหลังโครงการ", threshold_watch_cm: 80, threshold_warning_cm: 120, threshold_critical_cm: 150, report_interval_hours: 6 },
    { project_id: "AYA03", name: "บ้านสวนอยุธยา", address: "ถ.อู่ทอง อ.พระนครศรีอยุธยา", region: "กลาง", province: "พระนครศรีอยุธยา", lat: 14.35, lng: 100.57, units_total: 150, gauge_point: "ประตูระบายน้ำ 2", threshold_watch_cm: 100, threshold_warning_cm: 140, threshold_critical_cm: 180, report_interval_hours: 12 },
    { project_id: "CNX04", name: "ล้านนา เรสซิเดนซ์ เชียงใหม่", address: "ถ.เจริญราษฎร์ อ.เมือง", region: "เหนือ", province: "เชียงใหม่", lat: 18.77, lng: 99.0, units_total: 180, gauge_point: "แม่น้ำปิงหลังโครงการ", threshold_watch_cm: 90, threshold_warning_cm: 130, threshold_critical_cm: 170, report_interval_hours: 12 },
  ];
  for (const p of projects) await repo.insert("projects", { ...p, status: "active" }, by);

  const acc = [
    ["u_staff1", "NBR01", "edit"], ["u_staff2", "PTH02", "edit"], ["u_mgr", "NBR01", "edit"], ["u_mgr", "PTH02", "edit"], ["u_mgr", "AYA03", "edit"], ["u_staff2", "AYA03", "view"],
  ] as const;
  for (const [u, p, l] of acc) await repo.insert("access", { id: `acc_${u}_${p}`, user_id: u, project_id: p, access_level: l, valid_from: "", valid_to: "" }, by);

  const stn = [["NBR01", "CPY010", "แม่น้ำเจ้าพระยา อ.ปากเกร็ด", "เจ้าพระยา"], ["PTH02", "CPY010", "แม่น้ำเจ้าพระยา อ.ปากเกร็ด", "เจ้าพระยา"], ["AYA03", "C.13", "แม่น้ำเจ้าพระยา ท้ายเขื่อนเจ้าพระยา", "เจ้าพระยา"], ["CNX04", "P.1", "แม่น้ำปิง สะพานนวรัฐ", "ปิง"]];
  for (const [p, s, n, r] of stn) await repo.insert("stations", { link_id: `stn_${p}_${s}`, project_id: p, provider: "thaiwater", station_id: s, station_name: n, river: r, note: "" }, by);

  // รายงานย้อนหลังผ่าน service จริง เพื่อให้ CurrentStatus สอดคล้อง
  const sys = (id: string, name: string): Actor => ({ user_id: id, role: "admin", display_name: name });
  const hist: Array<[string, number, number, string]> = [
    ["NBR01", 30, 95, "น้ำระดับปกติ"], ["NBR01", 24, 118, "น้ำเริ่มสูงขึ้น"], ["NBR01", 18, 135, "ระดับเฝ้าระวัง ตั้งเครื่องสูบน้ำ"], ["NBR01", 12, 152, "น้ำท่วมถนนซอย 3"], ["NBR01", 5, 168, "ระดับเตือนภัย แจ้งลูกบ้านซอย 3-4"],
    ["PTH02", 20, 60, "ปกติ"], ["PTH02", 8, 85, "ระดับเฝ้าระวัง"],
    ["AYA03", 40, 70, "ปกติ"], ["AYA03", 14, 99, "ใกล้เกณฑ์เฝ้าระวัง"],
    ["CNX04", 10, 40, "ปกติ"],
  ];
  const { __withBypass } = await import("./seed-actor");
  for (const [pid, h, cm, note] of hist) {
    await __withBypass(sys("u_admin", "ผู้ดูแลระบบ"), async (a) => {
      await createReport(a, pid, { reported_at: iso(h), water_level_cm: cm, note, trend: cm > 100 ? "rising" : "steady", affected_areas: cm >= 150 ? "ซอย 3-4" : "", affected_units: cm >= 150 ? 12 : 0, pump_status: cm >= 120 ? "เดินเครื่อง 2 ตัว" : "", actions_taken: "", gauge_point: "", level: null, lat: null, lng: null });
    });
  }
  return { skipped: false };
}

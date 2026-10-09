/**
 * นิยามตารางทั้งหมด (single source of truth) ใช้ทั้ง setup:db, repository และ type
 * ทุกตารางมี version, updated_at, updated_by เพิ่มท้าย (ดู docs/ASSUMPTIONS.md)
 */
export type ColType = "s" | "n";
export interface TableDef {
  table: string;
  /** คอลัมน์ที่ประกอบเป็น primary key (composite ได้) */
  key: string[];
  cols: Record<string, ColType>;
}

const meta: Record<string, ColType> = { version: "n", updated_at: "s", updated_by: "s" };
const def = (table: string, key: string[], cols: Record<string, ColType>): TableDef => {
  const merged = { ...cols };
  for (const [k, t] of Object.entries(meta)) if (!(k in merged)) merged[k] = t;
  return { table, key, cols: merged };
};

export const TABLES = {
  users: def("Users", ["user_id"], {
    user_id: "s", email: "s", line_user_id: "s", display_name: "s", role: "s", avatar_url: "s", phone: "s", status: "s", created_at: "s",
  }),
  access: def("UserProjectAccess", ["id"], {
    id: "s", user_id: "s", project_id: "s", access_level: "s", valid_from: "s", valid_to: "s",
  }),
  projects: def("Projects", ["project_id"], {
    project_id: "s", name: "s", address: "s", region: "s", province: "s", lat: "n", lng: "n", units_total: "n", gauge_point: "s",
    threshold_watch_cm: "n", threshold_warning_cm: "n", threshold_critical_cm: "n", report_interval_hours: "n", status: "s",
  }),
  currentStatus: def("CurrentStatus", ["project_id"], {
    project_id: "s", level: "s", water_level_cm: "n", trend: "s", affected_units: "n", last_report_id: "s", last_reported_at: "s", last_reported_by: "s",
  }),
  /** append-only: key = report_id + revision */
  reports: def("Reports", ["report_id", "revision"], {
    report_id: "s", project_id: "s", revision: "n", reported_at: "s", level: "s", water_level_cm: "n", gauge_point: "s", trend: "s",
    affected_areas: "s", affected_units: "n", pump_status: "s", actions_taken: "s", note: "s", lat: "n", lng: "n", status: "s", created_by: "s", created_at: "s",
  }),
  photos: def("ReportPhotos", ["photo_id"], {
    photo_id: "s", report_id: "s", project_id: "s", object_key: "s", thumb_key: "s", taken_at: "s", lat: "n", lng: "n", uploaded_by: "s",
  }),
  audit: def("AuditLog", ["log_id"], {
    log_id: "s", at: "s", user_id: "s", action: "s", entity: "s", entity_id: "s", project_id: "s", detail: "s", ip: "s",
  }),
  /** ผูกโครงการกับสถานีวัดน้ำของหน่วยงานภายนอก */
  stations: def("StationLinks", ["link_id"], {
    link_id: "s", project_id: "s", provider: "s", station_id: "s", station_name: "s", river: "s", note: "s",
  }),
} satisfies Record<string, TableDef>;

export type TableName = keyof typeof TABLES;
export type Row = Record<string, string | number | null>;

export const rowKey = (t: TableName, row: Row) => TABLES[t].key.map((k) => String(row[k] ?? "")).join("#");
export const colList = (t: TableName) => Object.keys(TABLES[t].cols);

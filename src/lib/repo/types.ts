import type { Row, TableName } from "./schema";

export type Role = "staff" | "manager" | "executive" | "admin";
export type Level = "normal" | "watch" | "warning" | "critical";
export type Trend = "rising" | "steady" | "falling";
export type AccessLevel = "view" | "edit";

export interface User extends Row {
  user_id: string; email: string; line_user_id: string; display_name: string; role: Role; avatar_url: string; phone: string;
  status: "active" | "disabled" | "pending"; created_at: string; version: number; updated_at: string; updated_by: string;
}
export interface Access extends Row {
  id: string; user_id: string; project_id: string; access_level: AccessLevel; valid_from: string; valid_to: string; version: number;
}
export interface Project extends Row {
  project_id: string; name: string; address: string; region: string; province: string; lat: number | null; lng: number | null;
  units_total: number | null; gauge_point: string; threshold_watch_cm: number | null; threshold_warning_cm: number | null;
  threshold_critical_cm: number | null; report_interval_hours: number | null; status: string; version: number;
}
export interface CurrentStatus extends Row {
  project_id: string; level: Level; water_level_cm: number | null; trend: Trend; affected_units: number | null; last_report_id: string;
  last_reported_at: string; last_reported_by: string; version: number;
}
export interface Report extends Row {
  report_id: string; project_id: string; revision: number; reported_at: string; level: Level; water_level_cm: number | null;
  gauge_point: string; trend: Trend; affected_areas: string; affected_units: number | null; pump_status: string; actions_taken: string;
  note: string; lat: number | null; lng: number | null; status: "active" | "void"; created_by: string; created_at: string; version: number;
}
export interface Photo extends Row {
  photo_id: string; report_id: string; project_id: string; object_key: string; thumb_key: string; taken_at: string;
  lat: number | null; lng: number | null; uploaded_by: string;
}
export interface StationLink extends Row {
  link_id: string; project_id: string; provider: string; station_id: string; station_name: string; river: string; note: string; version: number;
}

export interface TableTypes {
  users: User; access: Access; projects: Project; currentStatus: CurrentStatus; reports: Report; photos: Photo;
  audit: Row; stations: StationLink;
}

/**
 * Repository: interface เดียวที่ซ่อน Google Sheets (ย้ายไป PostgreSQL ได้โดยไม่แตะ business logic)
 * - update() เป็น compare-and-set ด้วย version: ไม่ตรง => ConflictError (409)
 * - ผู้เรียกต้องถือ lock ที่เหมาะสมเอง (services/ ทำให้)
 */
export interface Repository {
  readonly mode: "real" | "mock";
  list<T extends TableName>(t: T, opts?: { fresh?: boolean }): Promise<TableTypes[T][]>;
  get<T extends TableName>(t: T, key: string, opts?: { fresh?: boolean }): Promise<TableTypes[T] | null>;
  /** แทรกแถวใหม่ (version=1) ; key ซ้ำ => error */
  insert<T extends TableName>(t: T, row: Partial<TableTypes[T]>, by: string): Promise<TableTypes[T]>;
  /** อัปเดตแบบ compare-and-set; patch ห้ามมี key/version */
  update<T extends TableName>(t: T, key: string, expectedVersion: number, patch: Partial<TableTypes[T]>, by: string): Promise<TableTypes[T]>;
  remove(t: TableName, key: string): Promise<void>;
  /** ensure ชีต/หัวคอลัมน์ (setup:sheets) */
  ensureSchema(): Promise<{ created: string[]; existing: string[] }>;
}

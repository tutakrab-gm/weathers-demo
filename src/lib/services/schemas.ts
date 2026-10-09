import { z } from "zod";

const num = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().finite().nullable());
const int = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).nullable());
const str = (max = 2000) => z.string().trim().max(max).default("");

export const levelEnum = z.enum(["normal", "watch", "warning", "critical"]);
export const trendEnum = z.enum(["rising", "steady", "falling"]);

export const reportInput = z.object({
  reported_at: z.string().datetime({ offset: true }).optional(),
  level: levelEnum.nullish(),
  water_level_cm: num.refine((v) => v === null || (v >= -500 && v <= 5000), "ระดับน้ำต้องอยู่ระหว่าง -500 ถึง 5000 ซม.").default(null),
  gauge_point: str(200),
  trend: trendEnum.nullish(),
  affected_areas: str(1000),
  affected_units: int.default(null),
  pump_status: str(500),
  actions_taken: str(2000),
  note: str(2000),
  lat: num.default(null),
  lng: num.default(null),
}).refine((v) => v.level || v.water_level_cm !== null, { message: "ต้องระบุระดับสถานการณ์หรือระดับน้ำ", path: ["level"] });
export type ReportInput = z.infer<typeof reportInput>;

export const revisePayload = z.object({ base_revision: z.coerce.number().int().min(1), data: reportInput });
export const voidPayload = z.object({ base_revision: z.coerce.number().int().min(1), reason: z.string().trim().min(3, "ระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(500) });

/* -------- admin CRUD -------- */
const email = z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.union([z.literal(""), z.email()])).default("");

export const adminSchemas = {
  users: z.object({
    user_id: z.string().trim().min(1).max(64).optional(),
    email, line_user_id: str(64), display_name: z.string().trim().min(1).max(120),
    role: z.enum(["staff", "manager", "executive", "admin"]), avatar_url: str(500), phone: str(30),
    status: z.enum(["active", "disabled", "pending"]).default("active"),
  }).refine((u) => u.email || u.line_user_id, { message: "ต้องมีอีเมลหรือ LINE user ID อย่างน้อยหนึ่งอย่าง", path: ["email"] }),
  access: z.object({
    id: z.string().optional(), user_id: z.string().min(1), project_id: z.string().min(1),
    access_level: z.enum(["view", "edit"]), valid_from: str(30), valid_to: str(30),
  }),
  projects: z.object({
    project_id: z.string().trim().regex(/^[A-Za-z0-9_-]{2,32}$/, "รหัสโครงการใช้ A-Z 0-9 _ - (2-32 ตัว)").optional(),
    name: z.string().trim().min(1).max(200), address: str(500), region: str(100), province: str(100),
    lat: num.default(null), lng: num.default(null), units_total: int.default(null), gauge_point: str(200),
    threshold_watch_cm: num.default(null), threshold_warning_cm: num.default(null), threshold_critical_cm: num.default(null),
    report_interval_hours: int.default(null), status: z.enum(["active", "archived"]).default("active"),
  }).refine((p) => {
    const t = [p.threshold_watch_cm, p.threshold_warning_cm, p.threshold_critical_cm];
    const given = t.filter((x): x is number => x !== null);
    return given.every((x, i) => i === 0 || x >= given[i - 1]);
  }, { message: "เกณฑ์ต้องเรียง เฝ้าระวัง ≤ เตือนภัย ≤ วิกฤต", path: ["threshold_warning_cm"] }),
  stations: z.object({
    link_id: z.string().optional(), project_id: z.string().min(1), provider: z.string().trim().min(1).max(40).default("thaiwater"),
    station_id: z.string().trim().min(1).max(64), station_name: str(200), river: str(200), note: str(500),
  }),
} as const;

export type AdminTable = keyof typeof adminSchemas;
export const isAdminTable = (s: string): s is AdminTable => s in adminSchemas;

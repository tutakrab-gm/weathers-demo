import type { Level, Project, Trend } from "../repo/types";

export const LEVELS: Level[] = ["normal", "watch", "warning", "critical"];
export const LEVEL_RANK: Record<Level, number> = { normal: 0, watch: 1, warning: 2, critical: 3 };
export const LEVEL_TH: Record<Level, string> = { normal: "ปกติ", watch: "เฝ้าระวัง", warning: "เตือนภัย", critical: "วิกฤต" };
export const LEVEL_COLOR: Record<Level, string> = { normal: "#16a34a", watch: "#ca8a04", warning: "#ea580c", critical: "#dc2626" };
export const TREND_TH: Record<Trend, string> = { rising: "ระดับน้ำเพิ่มขึ้น", steady: "คงที่", falling: "ระดับน้ำลดลง" };

type Th = Pick<Project, "threshold_watch_cm" | "threshold_warning_cm" | "threshold_critical_cm">;

/** ระดับสถานการณ์จากระดับน้ำ (cm) ตามเกณฑ์ของโครงการ; ไม่มีเกณฑ์ => null */
export function levelFromCm(cm: number | null | undefined, p: Th): Level | null {
  if (cm === null || cm === undefined || Number.isNaN(cm)) return null;
  const { threshold_watch_cm: w, threshold_warning_cm: wa, threshold_critical_cm: c } = p;
  if (c != null && cm >= c) return "critical";
  if (wa != null && cm >= wa) return "warning";
  if (w != null && cm >= w) return "watch";
  if (w == null && wa == null && c == null) return null;
  return "normal";
}

export function trendFromDelta(prev: number | null | undefined, cur: number | null | undefined, eps = 1): Trend | null {
  if (prev == null || cur == null) return null;
  if (cur - prev > eps) return "rising";
  if (prev - cur > eps) return "falling";
  return "steady";
}

export const maxLevel = (a: Level, b: Level): Level => (LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b);

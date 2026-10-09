import clsx from "clsx";
import { LEVEL_TH, TREND_TH } from "@/lib/services/levels";
import type { Level, Trend } from "@/lib/repo/types";

const bg: Record<Level, string> = {
  normal: "bg-green-100 text-green-800 ring-green-600/20", watch: "bg-yellow-100 text-yellow-800 ring-yellow-600/30",
  warning: "bg-orange-100 text-orange-800 ring-orange-600/30", critical: "bg-red-100 text-red-800 ring-red-600/30",
};
const dot: Record<Level, string> = { normal: "bg-green-600", watch: "bg-yellow-500", warning: "bg-orange-500", critical: "bg-red-600" };

export function LevelBadge({ level, className }: { level?: Level | null; className?: string }) {
  if (!level) return <span className={clsx("rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 ring-1 ring-slate-300", className)}>ยังไม่มีรายงาน</span>;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", bg[level], className)}>
      <span className={clsx("h-2 w-2 rounded-full", dot[level], level === "critical" && "animate-pulse")} />{LEVEL_TH[level]}
    </span>
  );
}
export const TrendIcon = ({ trend }: { trend?: Trend | null }) =>
  trend ? <span title={TREND_TH[trend]} className={trend === "rising" ? "text-red-600" : trend === "falling" ? "text-green-600" : "text-slate-500"}>{trend === "rising" ? "▲" : trend === "falling" ? "▼" : "■"} <span className="text-xs">{TREND_TH[trend]}</span></span> : null;

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return <div className="card !p-3 text-center"><div className={clsx("text-2xl font-bold", tone)}>{value}</div><div className="text-xs text-slate-500">{label}</div></div>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

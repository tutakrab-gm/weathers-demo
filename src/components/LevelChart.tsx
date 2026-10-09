"use client";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LEVEL_COLOR } from "@/lib/services/levels";
import { fmtThaiShort } from "@/lib/core/time";

export interface Point { at: string; cm: number }
export function LevelChart({ points, watch, warning, critical }: { points: Point[]; watch?: number | null; warning?: number | null; critical?: number | null }) {
  if (points.length < 2) return <p className="py-6 text-center text-sm text-slate-500">ต้องมีรายงานอย่างน้อย 2 รายการจึงจะแสดงกราฟ</p>;
  const data = points.map((p) => ({ t: new Date(p.at).getTime(), cm: p.cm }));
  return (
    <div className="h-56 w-full" role="img" aria-label="กราฟระดับน้ำย้อนหลัง">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtThaiShort(v)} tick={{ fontSize: 10 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} unit=" ซม." width={64} />
          <Tooltip labelFormatter={(v) => fmtThaiShort(Number(v))} formatter={(v) => [`${v} ซม.`, "ระดับน้ำ"]} />
          {watch != null && <ReferenceLine y={watch} stroke={LEVEL_COLOR.watch} strokeDasharray="4 4" label={{ value: "เฝ้าระวัง", fontSize: 10, fill: LEVEL_COLOR.watch, position: "insideTopLeft" }} />}
          {warning != null && <ReferenceLine y={warning} stroke={LEVEL_COLOR.warning} strokeDasharray="4 4" label={{ value: "เตือนภัย", fontSize: 10, fill: LEVEL_COLOR.warning, position: "insideTopLeft" }} />}
          {critical != null && <ReferenceLine y={critical} stroke={LEVEL_COLOR.critical} strokeDasharray="4 4" label={{ value: "วิกฤต", fontSize: 10, fill: LEVEL_COLOR.critical, position: "insideTopLeft" }} />}
          <Line type="monotone" dataKey="cm" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

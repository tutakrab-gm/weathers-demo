"use client";
import { useEffect, useState } from "react";

export interface Editor { user_id: string; name: string; since: number }

/** soft lock: heartbeat ทุก 60 วินาที (TTL ฝั่ง server 5 นาที) ; คืนรายชื่อผู้อื่นที่กำลังแก้ไข */
export function usePresence(projectId: string, enabled = true) {
  const [editors, setEditors] = useState<Editor[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const beat = async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/presence`, { method: "POST" });
        if (r.ok && alive) setEditors((await r.json()).editors);
      } catch { /* ออฟไลน์: ข้าม */ }
    };
    beat();
    const t = setInterval(beat, 60_000);
    return () => { alive = false; clearInterval(t); fetch(`/api/projects/${projectId}/presence`, { method: "DELETE", keepalive: true }).catch(() => undefined); };
  }, [projectId, enabled]);
  return editors;
}

export function PresenceBanner({ editors }: { editors: Editor[] }) {
  if (!editors.length) return null;
  return <div role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-300">⚠️ {editors.map((e) => e.name).join(", ")} กำลังเปิดแก้ไขโครงการนี้อยู่ — ระบบจะตรวจสอบความขัดแย้งให้ตอนบันทึก</div>;
}

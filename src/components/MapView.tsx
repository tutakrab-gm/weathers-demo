"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { LEVEL_COLOR, LEVEL_TH } from "@/lib/services/levels";
import type { Level } from "@/lib/repo/types";

export interface Pin { id: string; name: string; lat: number; lng: number; level?: Level | null; cm?: number | null; href?: string; kind?: "project" | "station"; sub?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MapView({ pins, height = 360 }: { pins: Pin[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView([14.0, 100.5], 7);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const pts: [number, number][] = [];
      for (const p of pins) {
        pts.push([p.lat, p.lng]);
        const color = p.kind === "station" ? "#475569" : LEVEL_COLOR[p.level ?? "normal"];
        const m = L.circleMarker([p.lat, p.lng], { radius: p.kind === "station" ? 6 : 11, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.95 }).addTo(map);
        m.bindPopup(`<b>${esc(p.name)}</b><br>${p.kind === "station" ? "สถานีหน่วยงานกลาง" : p.level ? "สถานะ: " + LEVEL_TH[p.level] : "ยังไม่มีรายงาน"}${p.cm != null ? `<br>ระดับน้ำ ${p.cm} ซม.` : ""}${p.sub ? `<br>${esc(p.sub)}` : ""}${p.href ? `<br><a href="${esc(p.href)}">ดูรายละเอียด →</a>` : ""}`);
      }
      if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 }); else if (pts.length === 1) map.setView(pts[0], 12);
    })();
    return () => { map?.remove(); };
  }, [pins]);
  return <div ref={el} style={{ height }} className="z-0 overflow-hidden rounded-2xl ring-1 ring-slate-200" role="img" aria-label="แผนที่โครงการ" />;
}

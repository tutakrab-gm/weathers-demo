import { env, modes } from "../core/env";
import { kv } from "../core/kv";

export interface StationReading {
  provider: string;
  station_id: string;
  name: string;
  river: string;
  province: string;
  /** ระดับน้ำ (ม.รทก.) หรือค่าที่หน่วยงานรายงาน */
  level_m: number | null;
  /** ระดับตลิ่ง (ม.) ถ้ามี */
  bank_m: number | null;
  flow_cms: number | null;
  /** สถานการณ์จากหน่วยงาน: normal|watch|warning|critical */
  situation: "normal" | "watch" | "warning" | "critical" | "unknown";
  observed_at: string;
  lat: number | null;
  lng: number | null;
  source: "mock" | "real";
}

export interface WaterProvider {
  listStations(): Promise<StationReading[]>;
  getStation(stationId: string): Promise<StationReading | null>;
}

/* ---------- mock: ข้อมูลจำลองที่เปลี่ยนตามเวลา (deterministic) ---------- */
const MOCK_STATIONS = [
  { id: "C.2", name: "แม่น้ำเจ้าพระยา อ.เมืองนครสวรรค์", river: "เจ้าพระยา", province: "นครสวรรค์", base: 21.5, bank: 25.0, amp: 1.6, lat: 15.7, lng: 100.12 },
  { id: "C.13", name: "แม่น้ำเจ้าพระยา ท้ายเขื่อนเจ้าพระยา", river: "เจ้าพระยา", province: "ชัยนาท", base: 12.0, bank: 15.1, amp: 1.2, lat: 15.17, lng: 100.18 },
  { id: "CPY010", name: "แม่น้ำเจ้าพระยา อ.ปากเกร็ด", river: "เจ้าพระยา", province: "นนทบุรี", base: 1.4, bank: 2.6, amp: 0.7, lat: 13.91, lng: 100.5 },
  { id: "S.5", name: "แม่น้ำท่าจีน อ.สามพราน", river: "ท่าจีน", province: "นครปฐม", base: 2.1, bank: 3.4, amp: 0.6, lat: 13.72, lng: 100.21 },
  { id: "P.1", name: "แม่น้ำปิง สะพานนวรัฐ", river: "ปิง", province: "เชียงใหม่", base: 3.2, bank: 5.3, amp: 0.9, lat: 18.79, lng: 99.0 },
  { id: "N.1", name: "แม่น้ำน่าน อ.เมืองน่าน", river: "น่าน", province: "น่าน", base: 4.0, bank: 6.9, amp: 1.0, lat: 18.78, lng: 100.78 },
];

function mockReading(s: (typeof MOCK_STATIONS)[number], now = Date.now()): StationReading {
  const t = now / 3_600_000;
  const seed = s.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const level = s.base + s.amp * Math.sin(t / 9 + seed) + 0.25 * Math.sin(t / 2.3 + seed * 2);
  const ratio = (level - s.base + s.amp) / (s.bank - s.base + s.amp);
  const situation = ratio > 0.92 ? "critical" : ratio > 0.8 ? "warning" : ratio > 0.65 ? "watch" : "normal";
  return {
    provider: "thaiwater", station_id: s.id, name: s.name, river: s.river, province: s.province,
    level_m: Math.round(level * 100) / 100, bank_m: s.bank, flow_cms: Math.round(200 + level * 60), situation,
    observed_at: new Date(Math.floor(now / 900_000) * 900_000).toISOString(), lat: s.lat, lng: s.lng, source: "mock",
  };
}
const mockProvider: WaterProvider = {
  async listStations() { return MOCK_STATIONS.map((s) => mockReading(s)); },
  async getStation(id) { const s = MOCK_STATIONS.find((x) => x.id === id); return s ? mockReading(s) : null; },
};

/* ---------- real: ThaiWater open API (โครงสร้าง response อาจเปลี่ยน — parse แบบ defensive) ---------- */
/* เอกสาร: https://api-v3.thaiwater.net/ — ตั้ง WATER_API_BASE_URL=https://api-v3.thaiwater.net/api/v1/thaiwater30/public */
type Json = Record<string, unknown>;
const pick = (o: Json | undefined, ...ks: string[]) => { for (const k of ks) if (o && o[k] != null) return o[k]; return undefined; };
const th = (v: unknown): string => (v && typeof v === "object" ? String((v as Json).th ?? (v as Json).en ?? "") : v == null ? "" : String(v));
const num = (v: unknown) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };

function parseThaiWater(item: Json): StationReading | null {
  const st = (item.station ?? {}) as Json;
  const id = String(pick(st, "tele_station_oldcode", "tele_station_code", "id") ?? pick(item, "station_id") ?? "");
  if (!id) return null;
  const level = num(pick(item, "waterlevel_msl", "waterlevel_m", "water_level"));
  const bank = num(pick(item, "station_bank_level", "bank_level", "left_bank")) ?? num(pick(st, "left_bank"));
  const sit = Number(pick(item, "storage_percent", "situation_level"));
  let situation: StationReading["situation"] = "unknown";
  if (level != null && bank != null) { const d = bank - level; situation = d <= 0.2 ? "critical" : d <= 0.7 ? "warning" : d <= 1.5 ? "watch" : "normal"; }
  else if (Number.isFinite(sit)) situation = sit > 100 ? "critical" : sit > 80 ? "warning" : "normal";
  return {
    provider: "thaiwater", station_id: id, name: th(pick(st, "tele_station_name")) || id, river: th(pick(st, "waterbody_name")) || "",
    province: th(((st.geocode ?? {}) as Json).province_name) || "", level_m: level, bank_m: bank, flow_cms: num(pick(item, "discharge", "flow")),
    situation, observed_at: String(pick(item, "waterlevel_datetime", "datetime") ?? new Date().toISOString()),
    lat: num(pick(st, "tele_station_lat")), lng: num(pick(st, "tele_station_long")), source: "real",
  };
}

const realProvider: WaterProvider = {
  async listStations() {
    const res = await fetch(`${env.waterApiBase.replace(/\/$/, "")}/waterlevel_load`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`water api ${res.status}`);
    const json = (await res.json()) as Json;
    const arr = (Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : []) as Json[];
    return arr.map(parseThaiWater).filter((x): x is StationReading => !!x);
  },
  async getStation(id) { return (await this.listStations()).find((s) => s.station_id === id) ?? null; },
};

/** cache 5 นาที (หน่วยงานอัปเดตทุก 15–60 นาที) */
const TTL = 5 * 60_000;
async function cached(): Promise<StationReading[]> {
  const k = "water:all";
  const hit = await kv().get(k);
  if (hit) return JSON.parse(hit);
  try {
    const all = await (modes.water === "real" ? realProvider : mockProvider).listStations();
    await kv().set(k, JSON.stringify(all), TTL);
    await kv().set(`${k}:stale`, JSON.stringify(all), 24 * 3_600_000);
    return all;
  } catch (e) {
    const stale = await kv().get(`${k}:stale`); // ใช้ข้อมูลเก่าเมื่อหน่วยงานล่ม
    if (stale) return JSON.parse(stale);
    throw e;
  }
}
export const listExternalStations = cached;
export async function getExternalStation(id: string) { return (await cached()).find((s) => s.station_id === id) ?? null; }

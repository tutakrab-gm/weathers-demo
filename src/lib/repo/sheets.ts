import { google, type sheets_v4 } from "googleapis";
import { env } from "../core/env";
import { ConflictError, AppError } from "../core/errors";
import { nowIso } from "../core/time";
import { decodeRow, encodeRow, normalize } from "./codec";
import { TABLES, rowKey, type Row, type TableName } from "./schema";
import type { Repository, TableTypes } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** exponential backoff เมื่อชน rate limit (429) หรือ 5xx ชั่วคราว */
export async function withBackoff<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let delay = 500;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = Number((e as { code?: number; status?: number }).code ?? (e as { status?: number }).status);
      const retriable = code === 429 || code === 503 || code === 500 || code === 502;
      if (!retriable || i >= tries) throw e;
      await sleep(delay + Math.random() * 250);
      delay *= 2;
    }
  }
}

const colLetter = (n: number) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

function credentials() {
  const raw = env.saJson.trim();
  const txt = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(txt);
}

interface Snapshot { rows: Row[]; at: number }

export class GoogleSheetsRepository implements Repository {
  readonly mode = "real" as const;
  private api: sheets_v4.Sheets;
  private cache = new Map<TableName, Snapshot>();
  private inflight = new Map<TableName, Promise<Snapshot>>();
  private sheetIds = new Map<string, number>();

  constructor(private spreadsheetId = env.sheetId, private ttl = env.sheetsCacheTtl) {
    const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    this.api = google.sheets({ version: "v4", auth });
  }

  private range(t: TableName, a1 = "") {
    const d = TABLES[t];
    const last = colLetter(Object.keys(d.cols).length - 1);
    return `'${d.sheet}'!${a1 || `A2:${last}`}`;
  }

  /** อ่านทั้งชีต (batchGet ทีเดียวรวมทุกตารางที่ขอผ่าน prefetch) */
  private async load(t: TableName, fresh = false): Promise<Snapshot> {
    const c = this.cache.get(t);
    if (!fresh && c && Date.now() - c.at < this.ttl) return c;
    const running = this.inflight.get(t);
    if (running && !fresh) return running;
    const p = (async () => {
      const res = await withBackoff(() => this.api.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range: this.range(t) }));
      const rows = (res.data.values ?? []).filter((r) => r.some((x) => x !== "" && x != null)).map((r) => decodeRow(t, r));
      const snap = { rows, at: Date.now() };
      this.cache.set(t, snap);
      return snap;
    })().finally(() => this.inflight.delete(t));
    this.inflight.set(t, p);
    return p;
  }

  /** อุ่น cache หลายตารางในการเรียกเดียว (batchGet) */
  async prefetch(tables: TableName[]) {
    const stale = tables.filter((t) => { const c = this.cache.get(t); return !c || Date.now() - c.at >= this.ttl; });
    if (!stale.length) return;
    const res = await withBackoff(() => this.api.spreadsheets.values.batchGet({ spreadsheetId: this.spreadsheetId, ranges: stale.map((t) => this.range(t)) }));
    res.data.valueRanges?.forEach((vr, i) => {
      const t = stale[i];
      const rows = (vr.values ?? []).filter((r) => r.some((x) => x !== "" && x != null)).map((r) => decodeRow(t, r));
      this.cache.set(t, { rows, at: Date.now() });
    });
  }

  async list<T extends TableName>(t: T, opts: { fresh?: boolean } = {}) {
    const s = await this.load(t, opts.fresh);
    return s.rows.map((r) => ({ ...r })) as unknown as TableTypes[T][];
  }
  async get<T extends TableName>(t: T, key: string, opts: { fresh?: boolean } = {}) {
    const s = await this.load(t, opts.fresh);
    const r = s.rows.find((x) => rowKey(t, x) === key);
    return (r ? { ...r } : null) as unknown as TableTypes[T] | null;
  }

  async insert<T extends TableName>(t: T, input: Partial<TableTypes[T]>, by: string) {
    const row = normalize(t, input as Record<string, unknown>);
    row.version = 1; row.updated_at = nowIso(); row.updated_by = by;
    const k = rowKey(t, row);
    if (!k.replace(/#/g, "")) throw new AppError(400, "bad_request", "ขาด primary key");
    const exists = await this.get(t, k, { fresh: true });
    if (exists) throw new AppError(409, "duplicate", `ข้อมูลซ้ำ: ${TABLES[t].sheet}/${k}`);
    await withBackoff(() => this.api.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId, range: this.range(t, "A1"), valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: [encodeRow(t, row)] },
    }));
    this.cache.delete(t);
    return row as unknown as TableTypes[T];
  }

  async update<T extends TableName>(t: T, key: string, expectedVersion: number, patch: Partial<TableTypes[T]>, by: string) {
    // อ่านสดเสมอ (ข้าม cache) เพื่อตรวจ version จากข้อมูลจริงในชีต
    const snap = await this.load(t, true);
    const idx = snap.rows.findIndex((x) => rowKey(t, x) === key);
    if (idx < 0) throw new AppError(404, "not_found", "ไม่พบข้อมูล");
    const cur = snap.rows[idx];
    if (Number(cur.version) !== Number(expectedVersion)) throw new ConflictError({ ...cur });
    const merged = normalize(t, { ...cur, ...(patch as Record<string, unknown>) });
    for (const k of TABLES[t].key) merged[k] = cur[k];
    merged.version = Number(cur.version) + 1; merged.updated_at = nowIso(); merged.updated_by = by;
    const rowNo = idx + 2; // header = แถว 1
    await withBackoff(() => this.api.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: [{ range: this.range(t, `A${rowNo}:${colLetter(Object.keys(TABLES[t].cols).length - 1)}${rowNo}`), values: [encodeRow(t, merged)] }] },
    }));
    this.cache.delete(t);
    return merged as unknown as TableTypes[T];
  }

  async remove(t: TableName, key: string) {
    const snap = await this.load(t, true);
    const idx = snap.rows.findIndex((x) => rowKey(t, x) === key);
    if (idx < 0) return;
    const sheetId = await this.sheetGid(TABLES[t].sheet);
    await withBackoff(() => this.api.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: idx + 1, endIndex: idx + 2 } } }] },
    }));
    this.cache.delete(t);
  }

  private async sheetGid(title: string): Promise<number> {
    if (this.sheetIds.has(title)) return this.sheetIds.get(title)!;
    const meta = await withBackoff(() => this.api.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: "sheets.properties" }));
    for (const s of meta.data.sheets ?? []) this.sheetIds.set(s.properties!.title!, s.properties!.sheetId!);
    return this.sheetIds.get(title)!;
  }

  async ensureSchema() {
    const meta = await withBackoff(() => this.api.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: "sheets.properties" }));
    const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
    const created: string[] = [], existing: string[] = [];
    const reqs: sheets_v4.Schema$Request[] = [];
    for (const d of Object.values(TABLES)) {
      if (have.has(d.sheet)) existing.push(d.sheet);
      else { created.push(d.sheet); reqs.push({ addSheet: { properties: { title: d.sheet, gridProperties: { frozenRowCount: 1 } } } }); }
    }
    if (reqs.length) await withBackoff(() => this.api.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests: reqs } }));
    // เขียนหัวคอลัมน์ทุกชีต (idempotent)
    await withBackoff(() => this.api.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: Object.values(TABLES).map((d) => ({ range: `'${d.sheet}'!A1:${colLetter(Object.keys(d.cols).length - 1)}1`, values: [Object.keys(d.cols)] })),
      },
    }));
    return { created, existing };
  }
}

import fs from "node:fs";
import path from "node:path";
import { ConflictError, AppError } from "../core/errors";
import { nowIso } from "../core/time";
import { normalize } from "./codec";
import { TABLES, rowKey, type Row, type TableName } from "./schema";
import type { Repository, TableTypes } from "./types";

type Db = Record<TableName, Map<string, Row>>;

/** In-memory repository + (ทางเลือก) persist เป็นไฟล์ JSON */
export class MockRepository implements Repository {
  readonly mode = "mock" as const;
  private db: Db;
  private file?: string;
  private saveTimer?: NodeJS.Timeout;
  /** หน่วงเวลาจำลอง latency ของ Sheets (ใช้ใน test พิสูจน์ race) */
  public latencyMs = 0;
  /** true = หน่วงระหว่างตรวจ version กับเขียน (จำลอง Sheets ที่ไม่มี transaction) เพื่อทดสอบว่า lock กันได้จริง */
  public racy = false;

  constructor(opts: { file?: string } = {}) {
    this.file = opts.file;
    this.db = Object.fromEntries((Object.keys(TABLES) as TableName[]).map((t) => [t, new Map()])) as unknown as Db;
    if (this.file && fs.existsSync(this.file)) this.load();
  }
  get isEmpty() { return this.db.users.size === 0 && this.db.projects.size === 0; }

  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file!, "utf8")) as Record<string, Row[]>;
      for (const t of Object.keys(TABLES) as TableName[]) for (const r of raw[t] ?? []) this.db[t].set(rowKey(t, r), r);
    } catch (e) { console.error("[mock-repo] load failed", e); }
  }
  private scheduleSave() {
    if (!this.file) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }
  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const out: Record<string, Row[]> = {};
    for (const t of Object.keys(TABLES) as TableName[]) out[t] = [...this.db[t].values()];
    fs.writeFileSync(this.file, JSON.stringify(out));
  }
  private async lat() { if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs)); }

  async list<T extends TableName>(t: T) {
    await this.lat();
    return [...this.db[t].values()].map((r) => ({ ...r })) as unknown as TableTypes[T][];
  }
  async get<T extends TableName>(t: T, key: string) {
    await this.lat();
    const r = this.db[t].get(key);
    return (r ? { ...r } : null) as unknown as TableTypes[T] | null;
  }
  async insert<T extends TableName>(t: T, input: Partial<TableTypes[T]>, by: string) {
    await this.lat();
    const row = normalize(t, input as Record<string, unknown>);
    row.version = 1; row.updated_at = nowIso(); row.updated_by = by;
    const k = rowKey(t, row);
    if (!k.replace(/#/g, "")) throw new AppError(400, "bad_request", "ขาด primary key");
    if (this.db[t].has(k)) throw new AppError(409, "duplicate", `ข้อมูลซ้ำ: ${t}/${k}`);
    this.db[t].set(k, row);
    this.scheduleSave();
    return { ...row } as unknown as TableTypes[T];
  }
  async update<T extends TableName>(t: T, key: string, expectedVersion: number, patch: Partial<TableTypes[T]>, by: string) {
    await this.lat();
    const cur = this.db[t].get(key);
    if (!cur) throw new AppError(404, "not_found", "ไม่พบข้อมูล");
    // ตรวจ version และเขียนใน tick เดียวกัน (atomic ใน single-thread)
    if (Number(cur.version) !== Number(expectedVersion)) throw new ConflictError({ ...cur });
    if (this.racy) await this.lat();
    const merged = normalize(t, { ...cur, ...(patch as Record<string, unknown>) });
    for (const k of TABLES[t].key) merged[k] = cur[k];
    merged.version = Number(cur.version) + 1; merged.updated_at = nowIso(); merged.updated_by = by;
    this.db[t].set(key, merged);
    this.scheduleSave();
    return { ...merged } as unknown as TableTypes[T];
  }
  async remove(t: TableName, key: string) { this.db[t].delete(key); this.scheduleSave(); }
  async ensureSchema() { return { created: [], existing: Object.values(TABLES).map((d) => d.sheet) }; }
}

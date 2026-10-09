import { Pool, type QueryResultRow } from "pg";
import { AppError, ConflictError } from "../core/errors";
import { env } from "../core/env";
import { nowIso } from "../core/time";
import { normalize } from "./codec";
import { TABLES, rowKey, type Row, type TableName } from "./schema";
import type { Repository, TableTypes } from "./types";

/** ชื่อตารางใน PostgreSQL: "UserProjectAccess" -> user_project_access */
export const pgTable = (t: TableName) => TABLES[t].table.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

const INT_COLS = new Set(["revision", "units_total", "affected_units", "report_interval_hours"]);
const colSql = (c: string, type: "s" | "n") =>
  c === "version" ? "integer NOT NULL DEFAULT 1" : INT_COLS.has(c) ? (c === "revision" ? "integer NOT NULL" : "integer") : type === "n" ? "double precision" : "text NOT NULL DEFAULT ''";

export function ddl(t: TableName): string {
  const d = TABLES[t];
  const cols = Object.entries(d.cols).map(([c, type]) => `${q(c)} ${colSql(c, type)}`);
  return `CREATE TABLE IF NOT EXISTS ${q(pgTable(t))} (${cols.join(", ")}, PRIMARY KEY (${d.key.map(q).join(", ")}))`;
}

/** ดัชนีสำหรับ query ตามโครงการ/เวลา (รายงานโตเร็วที่สุด) */
const INDEXES: Array<[TableName, string]> = [
  ["reports", "project_id, reported_at"], ["photos", "report_id"], ["photos", "project_id"], ["audit", "at"], ["access", "user_id"], ["stations", "project_id"],
];

export class PostgresRepository implements Repository {
  readonly mode = "real" as const;
  private pool: Pool;
  constructor(url = env.databaseUrl, pool?: Pool) {
    this.pool = pool ?? new Pool({ connectionString: url, max: 10, ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined });
    this.pool.on("error", (e) => console.error("[pg]", e.message));
  }
  async close() { await this.pool.end(); }

  private toRow(t: TableName, r: QueryResultRow): Row { return normalize(t, r); }
  private keyParts(t: TableName, key: string): string[] {
    const parts = key.split("#");
    if (parts.length !== TABLES[t].key.length) throw new AppError(400, "bad_key", "รูปแบบคีย์ไม่ถูกต้อง");
    return parts;
  }
  private where(t: TableName, from = 1) { return TABLES[t].key.map((k, i) => `${q(k)} = $${from + i}`).join(" AND "); }
  /** คีย์ตัวเลข (revision) ต้องส่งเป็นตัวเลข */
  private keyVals(t: TableName, key: string) {
    return this.keyParts(t, key).map((v, i) => (TABLES[t].cols[TABLES[t].key[i]] === "n" ? Number(v) : v));
  }

  async list<T extends TableName>(t: T) {
    const r = await this.pool.query(`SELECT * FROM ${q(pgTable(t))}`);
    return r.rows.map((x) => this.toRow(t, x)) as unknown as TableTypes[T][];
  }
  async get<T extends TableName>(t: T, key: string) {
    const r = await this.pool.query(`SELECT * FROM ${q(pgTable(t))} WHERE ${this.where(t)}`, this.keyVals(t, key));
    return (r.rows[0] ? this.toRow(t, r.rows[0]) : null) as unknown as TableTypes[T] | null;
  }
  async insert<T extends TableName>(t: T, input: Partial<TableTypes[T]>, by: string) {
    const row = normalize(t, input as Record<string, unknown>);
    row.version = 1; row.updated_at = nowIso(); row.updated_by = by;
    if (!rowKey(t, row).replace(/#/g, "")) throw new AppError(400, "bad_request", "ขาด primary key");
    const cols = Object.keys(TABLES[t].cols);
    try {
      await this.pool.query(`INSERT INTO ${q(pgTable(t))} (${cols.map(q).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => row[c]));
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError(409, "duplicate", `ข้อมูลซ้ำ: ${pgTable(t)}/${rowKey(t, row)}`);
      throw e;
    }
    return row as unknown as TableTypes[T];
  }

  /** compare-and-set แบบ atomic ในคำสั่งเดียว: UPDATE … WHERE key AND version = expected */
  async update<T extends TableName>(t: T, key: string, expectedVersion: number, patch: Partial<TableTypes[T]>, by: string) {
    const d = TABLES[t];
    const keyVals = this.keyVals(t, key);
    const p = normalize(t, patch as Record<string, unknown>);
    const given = new Set(Object.keys(patch as object));
    const sets = Object.keys(d.cols).filter((c) => given.has(c) && !d.key.includes(c) && !["version", "updated_at", "updated_by"].includes(c));
    const args: unknown[] = [...keyVals, expectedVersion];
    const setSql = sets.map((c) => { args.push(p[c]); return `${q(c)} = $${args.length}`; });
    args.push(nowIso(), by);
    setSql.push(`"version" = "version" + 1`, `"updated_at" = $${args.length - 1}`, `"updated_by" = $${args.length}`);
    const n = keyVals.length;
    const r = await this.pool.query(`UPDATE ${q(pgTable(t))} SET ${setSql.join(", ")} WHERE ${this.where(t)} AND "version" = $${n + 1} RETURNING *`, args);
    if (r.rows[0]) return this.toRow(t, r.rows[0]) as unknown as TableTypes[T];
    const cur = await this.get(t, key);
    if (!cur) throw new AppError(404, "not_found", "ไม่พบข้อมูล");
    throw new ConflictError({ ...(cur as Row) });
  }
  async remove(t: TableName, key: string) {
    await this.pool.query(`DELETE FROM ${q(pgTable(t))} WHERE ${this.where(t)}`, this.keyVals(t, key));
  }

  /** สร้างตาราง/ดัชนี (idempotent) และเพิ่มคอลัมน์ที่ยังขาด */
  async ensureSchema() {
    const created: string[] = [], existing: string[] = [];
    const have = new Set((await this.pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).rows.map((r) => r.table_name));
    for (const t of Object.keys(TABLES) as TableName[]) {
      (have.has(pgTable(t)) ? existing : created).push(pgTable(t));
      await this.pool.query(ddl(t));
      for (const [c, type] of Object.entries(TABLES[t].cols)) { // migrate เพิ่มคอลัมน์ใหม่ในอนาคต
        await this.pool.query(`ALTER TABLE ${q(pgTable(t))} ADD COLUMN IF NOT EXISTS ${q(c)} ${colSql(c, type).replace(" NOT NULL", "")}`);
      }
    }
    for (const [t, cols] of INDEXES) await this.pool.query(`CREATE INDEX IF NOT EXISTS ${pgTable(t)}_${cols.replace(/[^a-z_]+/g, "_")}_idx ON ${q(pgTable(t))} (${cols})`);
    return { created, existing };
  }
}

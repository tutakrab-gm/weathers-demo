import { TABLES, type Row, type TableName } from "./schema";

export function normalize(t: TableName, input: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [c, type] of Object.entries(TABLES[t].cols)) {
    const v = input[c];
    if (type === "n") {
      if (v === null || v === undefined || v === "") out[c] = null;
      else { const n = Number(v); out[c] = Number.isFinite(n) ? n : null; }
    } else out[c] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}

/** แปลงแถวจากชีต (string[]) เป็น Row */
export function decodeRow(t: TableName, cells: unknown[]): Row {
  const cols = Object.keys(TABLES[t].cols);
  const o: Record<string, unknown> = {};
  cols.forEach((c, i) => (o[c] = cells[i]));
  return normalize(t, o);
}
export function encodeRow(t: TableName, row: Row): (string | number)[] {
  return Object.keys(TABLES[t].cols).map((c) => {
    const v = row[c];
    return v === null || v === undefined ? "" : v;
  });
}

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

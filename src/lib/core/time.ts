export const TZ = "Asia/Bangkok";

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));

/** 9 ต.ค. 2569 14:30 (พ.ศ., Asia/Bangkok) */
export function fmtThaiDateTime(v: string | number | Date | null | undefined): string {
  if (!v) return "-";
  const d = toDate(v);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d) + " น.";
}
export function fmtThaiDate(v: string | number | Date | null | undefined): string {
  if (!v) return "-";
  const d = toDate(v);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
}
export function fmtThaiShort(v: string | number | Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(toDate(v));
}
/** ค่าสำหรับ <input type="datetime-local"> ตามเวลาไทย */
export function toLocalInput(v: string | Date = new Date()): string {
  const d = toDate(v);
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return p.replace(" ", "T");
}
/** แปลงค่า datetime-local (เวลาไทย) เป็น ISO UTC */
export function fromLocalInput(s: string): string {
  return new Date(`${s}:00+07:00`).toISOString();
}
export const nowIso = () => new Date().toISOString();

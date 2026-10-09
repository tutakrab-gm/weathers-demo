import { json, route } from "@/lib/server/http";
import { reportHistory, reviseReport, voidReport } from "@/lib/services/reports";
import { revisePayload, voidPayload } from "@/lib/services/schemas";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type P = { id: string; rid: string };

export const GET = route<P>(async (_r, { actor, params }) => reportHistory(actor, params.id, params.rid));
/** แก้ไข = สร้าง revision ใหม่ (ต้องส่ง base_revision ที่อ่านมา) */
export const PUT = route<P>(async (req, { actor, params }) => {
  const b = revisePayload.parse(await json(req));
  return reviseReport(actor, params.id, params.rid, b.base_revision, b.data);
});
/** ยกเลิก = revision ใหม่สถานะ void */
export const DELETE = route<P>(async (req, { actor, params }) => {
  const b = voidPayload.parse(await json(req));
  return voidReport(actor, params.id, params.rid, b.base_revision, b.reason);
});

import { NextResponse } from "next/server";
import { AppError } from "@/lib/core/errors";
import { route } from "@/lib/server/http";
import { addPhoto, listPhotos } from "@/lib/services/photos";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type P = { id: string; rid: string };

export const GET = route<P>(async (_r, { actor, params }) => (await listPhotos(actor, params.id, params.rid)).map((p) => ({ photo_id: p.photo_id, taken_at: p.taken_at, lat: p.lat, lng: p.lng })));
export const POST = route<P>(async (req, { actor, params }) => {
  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof File)) throw new AppError(400, "bad_request", "ไม่พบไฟล์");
  const num = (k: string) => { const v = form.get(k); return v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null; };
  const taken = String(form.get("taken_at") || "");
  const p = await addPhoto(actor, params.id, params.rid, { buffer: Buffer.from(await f.arrayBuffer()), type: f.type }, {
    taken_at: taken && !isNaN(Date.parse(taken)) ? new Date(taken).toISOString() : undefined, lat: num("lat"), lng: num("lng"),
  });
  return NextResponse.json({ photo_id: p.photo_id }, { status: 201 });
});

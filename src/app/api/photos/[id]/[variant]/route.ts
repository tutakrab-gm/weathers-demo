import { NextResponse } from "next/server";
import { storage } from "@/lib/adapters/storage";
import { notFound } from "@/lib/core/errors";
import { route } from "@/lib/server/http";
import { resolvePhoto } from "@/lib/services/photos";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ตรวจสิทธิ์โครงการของรูปทุกครั้ง แล้ว redirect ไป signed URL อายุ 2 นาที (real) หรือสตรีมไฟล์ (mock) */
export const GET = route<{ id: string; variant: string }>(async (_r, { actor, params }) => {
  const { key, url } = await resolvePhoto(actor, params.id, params.variant === "thumb" ? "thumb" : "full");
  if (url) return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, no-store" } });
  const buf = await storage().read(key);
  if (!buf) throw notFound();
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=300" } });
});

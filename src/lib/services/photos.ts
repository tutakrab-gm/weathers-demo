import sharp from "sharp";
import { storage } from "../adapters/storage";
import { AppError, notFound } from "../core/errors";
import { newId } from "../core/ids";
import { kv } from "../core/kv";
import { nowIso } from "../core/time";
import { repoReady } from "../repo";
import type { Photo } from "../repo/types";
import { assertProjectAccess, type Actor } from "./access";
import { audit } from "./audit";

export const MAX_PHOTOS_PER_REPORT = 10;
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function addPhoto(actor: Actor, projectId: string, reportId: string, file: { buffer: Buffer; type: string },
  meta: { taken_at?: string; lat?: number | null; lng?: number | null } = {}): Promise<Photo> {
  await assertProjectAccess(actor, projectId, "edit");
  if (!ALLOWED.has(file.type)) throw new AppError(415, "unsupported", "รองรับเฉพาะไฟล์รูป JPEG/PNG/WebP/HEIC");
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw new AppError(413, "too_large", "ไฟล์ใหญ่เกิน 12 MB");
  const repo = await repoReady();

  // ตรวจจริงว่าเป็นรูป (ไม่เชื่อ content-type จาก client) + ตัด EXIF/พิกัดที่ฝังมา + ย่อขนาด
  let full: Buffer, thumb: Buffer;
  try {
    const img = sharp(file.buffer, { failOn: "error" }).rotate();
    full = await img.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    thumb = await img.clone().resize({ width: 360, height: 360, fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
  } catch {
    throw new AppError(400, "bad_image", "อ่านไฟล์รูปไม่ได้");
  }

  return kv().withLock(`project:${projectId}`, async () => {
    const rep = (await repo.list("reports", { fresh: true })).find((r) => r.report_id === reportId && r.project_id === projectId);
    if (!rep) throw notFound("ไม่พบรายงาน");
    const count = (await repo.list("photos", { fresh: true })).filter((p) => p.report_id === reportId).length;
    if (count >= MAX_PHOTOS_PER_REPORT) throw new AppError(400, "limit", `แนบรูปได้ไม่เกิน ${MAX_PHOTOS_PER_REPORT} รูปต่อรายงาน`);
    const id = newId("pho");
    const base = `projects/${projectId}/${reportId}/${id}`;
    await storage().put(`${base}.jpg`, full, "image/jpeg");
    await storage().put(`${base}.thumb.jpg`, thumb, "image/jpeg");
    const row = await repo.insert("photos", {
      photo_id: id, report_id: reportId, project_id: projectId, object_key: `${base}.jpg`, thumb_key: `${base}.thumb.jpg`,
      taken_at: meta.taken_at || nowIso(), lat: meta.lat ?? null, lng: meta.lng ?? null, uploaded_by: actor.user_id,
    }, actor.user_id);
    await audit(actor.user_id, "photo.add", "photo", id, projectId, { report_id: reportId });
    return row;
  });
}

export async function listPhotos(actor: Actor, projectId: string, reportId?: string): Promise<Photo[]> {
  await assertProjectAccess(actor, projectId, "view");
  const rows = (await (await repoReady()).list("photos")).filter((p) => p.project_id === projectId && (!reportId || p.report_id === reportId));
  return rows.sort((a, b) => (a.taken_at < b.taken_at ? -1 : 1));
}

/** ตรวจสิทธิ์จากโครงการของรูปทุกครั้ง แล้วออก signed URL (real) หรืออ่านไฟล์ (mock) */
export async function resolvePhoto(actor: Actor, photoId: string, variant: "full" | "thumb") {
  const repo = await repoReady();
  const p = await repo.get("photos", photoId);
  if (!p) throw notFound();
  await assertProjectAccess(actor, p.project_id, "view");
  const key = variant === "thumb" ? p.thumb_key : p.object_key;
  const url = await storage().signedUrl(key, 120);
  return { photo: p, key, url };
}

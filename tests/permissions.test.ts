import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { accessMap } from "@/lib/services/access";
import { createReport, listReports } from "@/lib/services/reports";
import { adminCreate, adminUpdate } from "@/lib/services/admin";
import { addPhoto, resolvePhoto } from "@/lib/services/photos";
import { runTool } from "@/lib/services/chat";
import { overview } from "@/lib/services/overview";
import { exportPdf, exportXlsx } from "@/lib/services/export";
import { heartbeat } from "@/lib/services/presence";
import { consumeMagicToken, issueMagicToken } from "@/lib/services/magic";
import { levelFromCm } from "@/lib/services/levels";
import { A, blank, freshEnv } from "./helpers";
import type { MockRepository } from "@/lib/repo/mock";

let repo: MockRepository;
beforeEach(async () => { repo = await freshEnv(); });

describe("สิทธิ์ตามโครงการ", () => {
  it("staff เห็นเฉพาะโครงการที่ได้รับสิทธิ์", async () => {
    expect([...(await accessMap(A.staff1)).keys()]).toEqual(["NBR01"]);
    expect([...(await accessMap(A.exec)).keys()].sort()).toEqual(["AYA03", "CNX04", "NBR01", "PTH02"]);
  });
  it("staff แก้โครงการที่ไม่ได้รับสิทธิ์ไม่ได้ / ดูอย่างเดียวเขียนไม่ได้ / executive เขียนไม่ได้", async () => {
    await expect(createReport(A.staff1, "PTH02", { ...blank, water_level_cm: 10 })).rejects.toMatchObject({ status: 403 });
    await expect(createReport(A.staff2, "AYA03", { ...blank, water_level_cm: 10 })).rejects.toMatchObject({ status: 403 }); // view-only
    await expect(createReport(A.exec, "NBR01", { ...blank, water_level_cm: 10 })).rejects.toMatchObject({ status: 403 });
    await expect(listReports(A.staff1, "PTH02")).rejects.toMatchObject({ status: 403 });
  });
  it("สิทธิ์หมดอายุ (valid_to) มีผลทันที", async () => {
    const acc = (await repo.get("access", "acc_u_staff1_NBR01"))!;
    await repo.update("access", acc.id, acc.version, { valid_to: "2020-01-01" }, "t");
    expect((await accessMap(A.staff1)).size).toBe(0);
  });
  it("เฉพาะ admin จัดการข้อมูลหลักได้", async () => {
    await expect(adminCreate(A.staff1, "users", { display_name: "x", email: "x@e.com", role: "admin" })).rejects.toMatchObject({ status: 403 });
    await expect(adminCreate(A.mgr, "projects", { name: "x" })).rejects.toMatchObject({ status: 403 });
  });
  it("overview และ chat tool เคารพสิทธิ์", async () => {
    expect((await overview(A.staff1)).cards.map((c) => c.project.project_id)).toEqual(["NBR01"]);
    await expect(runTool(A.staff1, "get_project", { project_id: "PTH02" })).rejects.toMatchObject({ status: 403 });
    await expect(runTool(A.staff1, "get_external_stations", { project_id: "PTH02" })).rejects.toMatchObject({ status: 403 });
    const list = (await runTool(A.staff1, "find_project", { query: "ปทุม" })) as unknown[];
    expect(list).toHaveLength(0);
  });
  it("heartbeat soft-lock เห็นผู้แก้ไขคนอื่น", async () => {
    await heartbeat(A.staff1, "NBR01");
    const seen = await heartbeat(A.mgr, "NBR01");
    expect(seen.map((s) => s.user_id)).toEqual(["u_staff1"]);
  });
});

describe("รูปภาพ", () => {
  it("อัปโหลด/ออก URL ตามสิทธิ์; ไฟล์ไม่ใช่รูปถูกปฏิเสธ", async () => {
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#09f" } }).jpeg().toBuffer();
    const r = await createReport(A.staff1, "NBR01", { ...blank, water_level_cm: 100 });
    const p = await addPhoto(A.staff1, "NBR01", r.report_id, { buffer: jpg, type: "image/jpeg" });
    expect((await resolvePhoto(A.mgr, p.photo_id, "thumb")).key).toContain("thumb");
    await expect(resolvePhoto(A.staff2, p.photo_id, "full")).rejects.toMatchObject({ status: 403 });
    await expect(addPhoto(A.staff1, "NBR01", r.report_id, { buffer: Buffer.from("not an image"), type: "image/jpeg" })).rejects.toMatchObject({ status: 400 });
    await expect(addPhoto(A.staff1, "NBR01", r.report_id, { buffer: jpg, type: "application/pdf" })).rejects.toMatchObject({ status: 415 });
  });
});

describe("เบ็ดเตล็ด", () => {
  it("level จากเกณฑ์", () => {
    const t = { threshold_watch_cm: 100, threshold_warning_cm: 150, threshold_critical_cm: 200 };
    expect([50, 100, 150, 200].map((c) => levelFromCm(c, t))).toEqual(["normal", "watch", "warning", "critical"]);
    expect(levelFromCm(10, { threshold_watch_cm: null, threshold_warning_cm: null, threshold_critical_cm: null })).toBeNull();
  });
  it("ระดับที่เจ้าหน้าที่เลือกต่ำกว่าเกณฑ์คำนวณไม่ได้", async () => {
    const r = await createReport(A.staff1, "NBR01", { ...blank, water_level_cm: 205, level: "normal" });
    expect(r.level).toBe("critical");
  });
  it("magic link ใช้ได้ครั้งเดียว", async () => {
    const t = await issueMagicToken("A@Example.com");
    expect(await consumeMagicToken(t)).toBe("a@example.com");
    expect(await consumeMagicToken(t)).toBeNull();
    expect(await consumeMagicToken("junk")).toBeNull();
  });
  it("ปิดบัญชีผู้ใช้ผ่าน admin และห้ามปิดตัวเอง", async () => {
    const u = (await repo.get("users", "u_staff1"))!;
    const off = await adminUpdate(A.admin, "users", "u_staff1", u.version, { ...u, status: "disabled" });
    expect(off.status).toBe("disabled");
    const me = (await repo.get("users", "u_admin"))!;
    await expect(adminUpdate(A.admin, "users", "u_admin", me.version, { ...me, status: "disabled" })).rejects.toMatchObject({ code: "self_lockout" });
  });
  it("ส่งออก xlsx/pdf ได้ และจำกัดตามสิทธิ์", async () => {
    const x = await exportXlsx(A.staff1, {});
    expect(x.subarray(0, 2).toString()).toBe("PK");
    const pdf = await exportPdf(A.exec, {});
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await expect(exportXlsx(A.staff1, { projectIds: ["PTH02"] })).rejects.toMatchObject({ status: 400 });
  });
});

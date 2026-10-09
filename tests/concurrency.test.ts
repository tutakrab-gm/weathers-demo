import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/lib/core/errors";
import { adminUpdate } from "@/lib/services/admin";
import { createReport, listReports, reviseReport, voidReport, reportHistory } from "@/lib/services/reports";
import { repoReady } from "@/lib/repo";
import type { MockRepository } from "@/lib/repo/mock";
import { A, blank, freshEnv } from "./helpers";

let repo: MockRepository;
beforeEach(async () => { repo = await freshEnv(); });

describe("optimistic locking", () => {
  it("เขียนพร้อมกัน 2 คนด้วย version เดียวกัน: คนหนึ่งสำเร็จ อีกคน 409 และข้อมูลไม่ถูกทับเงียบ ๆ", async () => {
    repo.racy = true; repo.latencyMs = 5; // จำลอง Sheets: ตรวจ version กับเขียนไม่ atomic
    const p = (await repo.get("projects", "NBR01"))!;
    const mine = { ...p, name: "ชื่อจากคน A" }, theirs = { ...p, name: "ชื่อจากคน B" };
    const results = await Promise.allSettled([
      adminUpdate(A.admin, "projects", "NBR01", p.version, mine),
      adminUpdate(A.admin, "projects", "NBR01", p.version, theirs),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(ConflictError);
    expect((bad[0].reason as ConflictError).status).toBe(409);
    const final = (await repo.get("projects", "NBR01"))!;
    expect(final.version).toBe(p.version + 1);
    expect(["ชื่อจากคน A", "ชื่อจากคน B"]).toContain(final.name);
    // 409 ต้องส่งแถวล่าสุดกลับ เพื่อให้ UI เทียบ "ของฉัน vs ล่าสุด"
    expect(((bad[0].reason as ConflictError).current as { name: string }).name).toBe(final.name);
  });

  it("ไม่มี lock จะเห็นปัญหา (ควบคุม): update ตรงของ repo ที่ version เดิมสองครั้งต้องไม่ผ่านทั้งคู่", async () => {
    const p = (await repo.get("projects", "NBR01"))!;
    await repo.update("projects", "NBR01", p.version, { name: "x" }, "t");
    await expect(repo.update("projects", "NBR01", p.version, { name: "y" }, "t")).rejects.toBeInstanceOf(ConflictError);
  });

  it("แก้ไข version เก่า => 409 แล้วรวมด้วย version ล่าสุดสำเร็จ", async () => {
    const p = (await repo.get("projects", "AYA03"))!;
    await adminUpdate(A.admin, "projects", "AYA03", p.version, { ...p, address: "ที่อยู่ใหม่ A" });
    await expect(adminUpdate(A.admin, "projects", "AYA03", p.version, { ...p, province: "อยุธยา B" })).rejects.toMatchObject({ status: 409 });
    const latest = (await repo.get("projects", "AYA03"))!;
    const merged = await adminUpdate(A.admin, "projects", "AYA03", latest.version, { ...latest, province: "อยุธยา B" });
    expect(merged.address).toBe("ที่อยู่ใหม่ A");
    expect(merged.province).toBe("อยุธยา B");
  });
});

describe("รายงานแบบ append-only", () => {
  it("รายงานพร้อมกัน 20 รายการ ไม่มีข้อมูลหาย และ CurrentStatus ตรงกับรายงานล่าสุด", async () => {
    repo.racy = true; repo.latencyMs = 2;
    const before = (await repo.list("reports")).filter((r) => r.project_id === "PTH02").length;
    const base = Date.now();
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      createReport(A.staff2, "PTH02", { ...blank, water_level_cm: 50 + i, reported_at: new Date(base + i * 1000).toISOString() })));
    const after = (await repo.list("reports")).filter((r) => r.project_id === "PTH02").length;
    expect(after - before).toBe(20);
    const st = (await repo.get("currentStatus", "PTH02"))!;
    expect(st.water_level_cm).toBe(69); // รายงานที่ reported_at ล่าสุด
  });

  it("แก้ไข = revision ใหม่ ไม่ทับของเดิม; แก้จาก revision เก่า => 409", async () => {
    const r1 = await createReport(A.staff1, "NBR01", { ...blank, water_level_cm: 100 });
    const r2 = await reviseReport(A.staff1, "NBR01", r1.report_id, 1, { ...blank, water_level_cm: 110 });
    expect(r2.revision).toBe(2);
    await expect(reviseReport(A.mgr, "NBR01", r1.report_id, 1, { ...blank, water_level_cm: 999 })).rejects.toBeInstanceOf(ConflictError);
    const hist = await reportHistory(A.staff1, "NBR01", r1.report_id);
    expect(hist.map((h) => [h.revision, h.water_level_cm])).toEqual([[1, 100], [2, 110]]);
  });

  it("แก้ไขพร้อมกันจาก revision เดียวกัน: สำเร็จ 1 อีกคน 409", async () => {
    repo.racy = true; repo.latencyMs = 3;
    const r = await createReport(A.staff1, "NBR01", { ...blank, water_level_cm: 100 });
    const res = await Promise.allSettled([
      reviseReport(A.staff1, "NBR01", r.report_id, 1, { ...blank, water_level_cm: 101 }),
      reviseReport(A.mgr, "NBR01", r.report_id, 1, { ...blank, water_level_cm: 102 }),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  it("void สร้าง revision ใหม่, รายงานหายจากรายการ, CurrentStatus ย้อนไปรายงานก่อนหน้า", async () => {
    const before = (await repo.get("currentStatus", "NBR01"))!;
    const r = await createReport(A.staff1, "NBR01", { ...blank, water_level_cm: 210, reported_at: new Date().toISOString() });
    expect((await repo.get("currentStatus", "NBR01"))!.level).toBe("critical");
    await voidReport(A.staff1, "NBR01", r.report_id, 1, "กรอกผิดโครงการ");
    const after = (await repo.get("currentStatus", "NBR01"))!;
    expect(after.water_level_cm).toBe(before.water_level_cm);
    expect((await listReports(A.staff1, "NBR01")).some((x) => x.report_id === r.report_id)).toBe(false);
    expect((await listReports(A.staff1, "NBR01", { includeVoid: true })).find((x) => x.report_id === r.report_id)?.status).toBe("void");
    const rows = (await (await repoReady()).list("reports")).filter((x) => x.report_id === r.report_id);
    expect(rows).toHaveLength(2); // ของเดิมยังอยู่
  });
});

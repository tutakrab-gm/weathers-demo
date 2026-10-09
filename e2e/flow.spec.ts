import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId(`dev-${email}`).click();
  await page.waitForURL((u) => u.pathname === "/" || u.pathname === "/pending");
}

test("ต้อง login ก่อนเข้าทุกหน้าและทุก API", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  for (const url of ["/api/projects", "/api/me", "/api/external/stations", "/api/export", "/api/admin/users"]) {
    const r = await request.get(url);
    expect(r.status(), url).toBe(401);
  }
  expect((await request.post("/api/chat", { data: { messages: [{ role: "user", content: "x" }] } })).status()).toBe(401);
  expect((await request.get("/api/cron/remind")).status()).toBe(401); // ไม่มี CRON_SECRET
});

test("เจ้าหน้าที่ส่งรายงานพร้อมรูป เห็นเฉพาะโครงการตัวเอง", async ({ page }) => {
  await login(page, "staff1@example.com");
  await expect(page.getByText("ริเวอร์ไซด์ วิลล่า นนทบุรี").first()).toBeVisible();
  await expect(page.getByText("การ์เด้นโฮม ปทุมธานี")).toHaveCount(0);
  // เข้าโครงการที่ไม่มีสิทธิ์ => ไม่พบ
  const r = await page.request.get("/api/projects/PTH02");
  expect(r.status()).toBe(403);

  await page.getByText("ริเวอร์ไซด์ วิลล่า นนทบุรี").first().click();
  await page.getByRole("link", { name: "+ รายงานสถานการณ์" }).click();
  await page.getByLabel("ระดับน้ำ (ซม.)").fill("205");
  await expect(page.getByText("ระบบแนะนำ: วิกฤต")).toBeVisible();
  await page.getByLabel("พื้นที่ได้รับผลกระทบ").fill("ซอย 1-5");
  await page.locator('input[type=file]').setInputFiles({ name: "p.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
  await page.getByRole("button", { name: "ส่งรายงาน" }).click();
  await expect(page).toHaveURL(/\/projects\/NBR01$/);
  await expect(page.getByText("205 ซม.").first()).toBeVisible();
  await expect(page.getByAltText("รูปประกอบรายงาน").first()).toBeVisible();
});

test("แก้ไขพร้อมกัน 2 คน => เห็นหน้าเปรียบเทียบและเลือกค่าได้", async ({ browser }) => {
  const mk = async (email: string) => { const c = await browser.newContext(); const p = await c.newPage(); await login(p, email); return p; };
  const a = await mk("staff1@example.com"), b = await mk("manager@example.com");
  const list = await a.request.get("/api/projects/NBR01/reports");
  const rid = (await list.json())[0].report_id as string;
  await a.goto(`/projects/NBR01/report/${rid}`); await b.goto(`/projects/NBR01/report/${rid}`);
  await expect(b.getByRole("button", { name: "บันทึกการแก้ไข" })).toBeVisible();
  await a.getByLabel("หมายเหตุ").fill("แก้โดย A");
  await a.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(a).toHaveURL(/\/projects\/NBR01$/);
  await b.getByLabel("หมายเหตุ").fill("แก้โดย B");
  await b.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(b.getByRole("dialog")).toContainText("ข้อมูลถูกแก้ไขโดยผู้อื่น");
  await expect(b.getByRole("dialog")).toContainText("แก้โดย A");
  await b.getByRole("button", { name: "บันทึกที่รวมแล้ว" }).click();
  await expect(b).toHaveURL(/\/projects\/NBR01$/);
  await expect(b.getByText("แก้โดย B")).toBeVisible();
});

test("ผู้บริหารเห็นทุกโครงการ + chat + ไม่มีปุ่มรายงาน", async ({ page }) => {
  await login(page, "exec@example.com");
  for (const n of ["ริเวอร์ไซด์ วิลล่า นนทบุรี", "การ์เด้นโฮม ปทุมธานี", "บ้านสวนอยุธยา", "ล้านนา เรสซิเดนซ์ เชียงใหม่"]) await expect(page.getByText(n).first()).toBeVisible();
  await page.getByText("การ์เด้นโฮม ปทุมธานี").first().click();
  await expect(page.getByRole("link", { name: "+ รายงานสถานการณ์" })).toHaveCount(0);
  await page.goto("/chat");
  await page.getByRole("button", { name: "สรุปสถานการณ์ทุกโครงการตอนนี้" }).click();
  await expect(page.getByText("ภาพรวม 4 โครงการ")).toBeVisible();
  expect((await page.request.get("/api/export?format=xlsx")).status()).toBe(200);
  expect((await page.request.get("/admin/users")).url()).not.toContain("/admin/users");
});

test("admin: ปิดบัญชีมีผลทันที และผู้ไม่อยู่ในชีตเห็นหน้ารออนุมัติ", async ({ page, browser }) => {
  const c2 = await browser.newContext(); const p2 = await c2.newPage();
  await login(p2, "staff2@example.com");
  expect((await p2.request.get("/api/projects")).status()).toBe(200);

  await login(page, "admin@example.com");
  const users = await (await page.request.get("/api/admin/users")).json();
  const u = users.find((x: { email: string }) => x.email === "staff2@example.com");
  const off = await page.request.put(`/api/admin/users/${u.user_id}`, { data: { version: u.version, data: { ...u, status: "disabled" } } });
  expect(off.status()).toBe(200);
  expect((await p2.request.get("/api/projects")).status()).toBe(403); // มีผลทันที
  await p2.goto("/"); await expect(p2).toHaveURL(/\/pending/);
  await expect(p2.getByText("บัญชีถูกปิดการใช้งาน")).toBeVisible();

  await page.goto("/admin/projects");
  await expect(page.getByRole("heading", { name: "โครงการ" })).toBeVisible();
  await expect(page.getByText("NBR01").first()).toBeVisible();
});

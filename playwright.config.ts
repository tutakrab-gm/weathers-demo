import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// ใช้ Chromium ที่ติดตั้งไว้ในเครื่อง (ไม่ดาวน์โหลดใหม่); undefined = ให้ Playwright หาเอง
const chromium = ["/opt/pw-browsers/chromium"].find((p) => fs.existsSync(p));
const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "th-TH", timezoneId: "Asia/Bangkok", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath: chromium, args: ["--no-sandbox"] } } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    port: PORT, timeout: 300_000, reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1", FORCE_MOCK: "1", MOCK_PERSIST: "0", AUTH_SECRET: "e2e-secret", AUTH_URL: `http://localhost:${PORT}`, AUTH_TRUST_HOST: "true", APP_BASE_URL: `http://localhost:${PORT}` },
  },
});

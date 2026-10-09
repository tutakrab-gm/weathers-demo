/** อ่านค่า env และตัดสินโหมด real/mock ของแต่ละ adapter */
const e = (k: string) => (process.env[k] ?? "").trim();

const forceMock = e("FORCE_MOCK") === "1";

export const env = {
  isProd: process.env.NODE_ENV === "production",
  baseUrl: e("APP_BASE_URL") || "http://localhost:3000",
  cronSecret: e("CRON_SECRET"),
  authSecret: e("AUTH_SECRET") || (process.env.NODE_ENV === "production" ? "" : "dev-only-secret-do-not-use-in-production"),
  sheetId: e("SHEET_ID"),
  saJson: e("GOOGLE_SERVICE_ACCOUNT_JSON"),
  sheetsCacheTtl: Number(e("SHEETS_CACHE_TTL_MS") || 5000),
  s3: {
    endpoint: e("S3_ENDPOINT"),
    region: e("S3_REGION") || "auto",
    bucket: e("S3_BUCKET"),
    key: e("S3_ACCESS_KEY_ID"),
    secret: e("S3_SECRET_ACCESS_KEY"),
  },
  redisUrl: e("REDIS_URL"),
  line: { id: e("AUTH_LINE_ID"), secret: e("AUTH_LINE_SECRET"), token: e("LINE_CHANNEL_ACCESS_TOKEN") },
  google: { id: e("AUTH_GOOGLE_ID"), secret: e("AUTH_GOOGLE_SECRET") },
  smtpUrl: e("SMTP_URL"),
  smtpFrom: e("SMTP_FROM") || "ระบบสถานการณ์น้ำ <no-reply@example.com>",
  adminLineIds: e("ADMIN_LINE_USER_IDS").split(",").map((s) => s.trim()).filter(Boolean),
  waterApiBase: e("WATER_API_BASE_URL"),
  anthropicKey: e("ANTHROPIC_API_KEY"),
  claudeModel: e("CLAUDE_MODEL") || "claude-sonnet-5-5",
  internalCron: e("ENABLE_INTERNAL_CRON") === "1",
};

export const modes = {
  sheets: !forceMock && env.sheetId && env.saJson ? "real" : "mock",
  storage: !forceMock && env.s3.bucket && env.s3.key && env.s3.secret ? "real" : "mock",
  redis: !forceMock && env.redisUrl ? "real" : "mock",
  line: !forceMock && env.line.token ? "real" : "mock",
  water: !forceMock && env.waterApiBase ? "real" : "mock",
  chat: !forceMock && env.anthropicKey ? "real" : "mock",
} as const;

/**
 * Dev login เปิดได้เฉพาะเมื่อ Sheets เป็น mock (ไม่มีข้อมูลจริงให้เสี่ยง) และไม่ใช่ production
 * ข้อยกเว้นเดียว: DEMO_DEV_LOGIN=1 (docker-compose ตั้งให้เพื่อให้ `docker compose up` ทดลองได้ทันที)
 * ซึ่งเมื่อตั้ง SHEET_ID จริงจะปิดเองอัตโนมัติ
 */
export const devLoginEnabled = () => modes.sheets === "mock" && (!env.isProd || e("DEMO_DEV_LOGIN") === "1");
export const emailLoginEnabled = () => !!env.smtpUrl;
export const lineLoginEnabled = () => !!(env.line.id && env.line.secret);
export const googleLoginEnabled = () => !!(env.google.id && env.google.secret);

/** อ่านค่า env และตัดสินโหมด real/mock ของแต่ละ adapter */
const e = (k: string) => (process.env[k] ?? "").trim();

const forceMock = e("FORCE_MOCK") === "1";

export const env = {
  isProd: process.env.NODE_ENV === "production",
  baseUrl: e("APP_BASE_URL") || "http://localhost:3000",
  cronSecret: e("CRON_SECRET"),
  authSecret: e("AUTH_SECRET") || (process.env.NODE_ENV === "production" ? "" : "dev-only-secret-do-not-use-in-production"),
  databaseUrl: e("DATABASE_URL"),
  databaseSsl: e("DATABASE_SSL") === "1",
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
  db: !forceMock && env.databaseUrl ? "real" : "mock",
  storage: !forceMock && env.s3.bucket && env.s3.key && env.s3.secret ? "real" : "mock",
  redis: !forceMock && env.redisUrl ? "real" : "mock",
  line: !forceMock && env.line.token ? "real" : "mock",
  water: !forceMock && env.waterApiBase ? "real" : "mock",
  chat: !forceMock && env.anthropicKey ? "real" : "mock",
} as const;

/**
 * Dev login: เฉพาะ non-production, หรือ production ที่ตั้ง DEMO_DEV_LOGIN=1 (docker-compose ตั้งให้เพื่อเดโม)
 * และต้องเป็นฐานข้อมูล mock หรือฐานเดโมที่ seed เอง (AUTO_SEED=1) เท่านั้น
 * กรณีฐาน PostgreSQL จริง จะยอมเฉพาะอีเมล @example.com (ข้อมูลเดโม) — ดู devLoginAllowsEmail
 */
export const devLoginEnabled = () =>
  (modes.db === "mock" || e("AUTO_SEED") === "1") && (!env.isProd || e("DEMO_DEV_LOGIN") === "1");
export const devLoginAllowsEmail = (email: string) => modes.db === "mock" || email.toLowerCase().endsWith("@example.com");
export const emailLoginEnabled = () => !!env.smtpUrl;
export const lineLoginEnabled = () => !!(env.line.id && env.line.secret);
export const googleLoginEnabled = () => !!(env.google.id && env.google.secret);

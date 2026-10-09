/** ตัวตั้งเวลาในโปรเซส (ENABLE_INTERNAL_CRON=1) — ใช้กับ instance เดียวเท่านั้น; หลาย instance ให้เรียก /api/cron/* จาก scheduler ภายนอก */
export async function start() {
  if (process.env.ENABLE_INTERNAL_CRON !== "1") return;
  const cron = await import("node-cron");
  const { remindOverdue, refreshExternal } = await import("./lib/services/jobs");
  const safe = (n: string, f: () => Promise<unknown>) => () => f().catch((e) => console.error(`[cron:${n}]`, e));
  cron.schedule("*/30 * * * *", safe("remind", remindOverdue), { timezone: "Asia/Bangkok" });
  cron.schedule("*/20 * * * *", safe("refresh", refreshExternal), { timezone: "Asia/Bangkok" });
  console.log("[water-watch] internal cron enabled");
}

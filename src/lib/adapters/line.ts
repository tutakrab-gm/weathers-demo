import { env, modes } from "../core/env";
import { log } from "../core/logger";

export interface OutboxMsg { to: string; text: string; at: string }
const g = globalThis as unknown as { __outbox?: OutboxMsg[] };
export const outbox = () => (g.__outbox ??= []);

/** ส่งข้อความ LINE (push) — mock = เก็บใน outbox + log */
export async function pushLine(to: string, text: string): Promise<boolean> {
  if (!to) return false;
  if (modes.line === "mock") {
    outbox().push({ to, text, at: new Date().toISOString() });
    if (outbox().length > 200) outbox().shift();
    log(`[LINE mock] -> ${to}: ${text.replace(/\n/g, " ⏎ ")}`);
    return true;
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.line.token}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  if (!res.ok) console.error("[LINE] push failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}

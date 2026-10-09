import { SignJWT, jwtVerify } from "jose";
import nodemailer from "nodemailer";
import { env, emailLoginEnabled } from "../core/env";
import { AppError } from "../core/errors";
import { randomToken } from "../core/ids";
import { kv } from "../core/kv";
import { log } from "../core/logger";

const key = () => new TextEncoder().encode(env.authSecret + ":magic");
const TTL_MIN = 15;

export async function issueMagicToken(email: string): Promise<string> {
  const jti = randomToken(12);
  return new SignJWT({ email }).setProtectedHeader({ alg: "HS256" }).setJti(jti).setIssuedAt().setExpirationTime(`${TTL_MIN}m`).sign(key());
}

/** ใช้ได้ครั้งเดียว: เก็บ jti ที่ถูกใช้แล้วจนกว่าโทเคนจะหมดอายุ */
export async function consumeMagicToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.jti || typeof payload.email !== "string") return null;
    if (!(await kv().setNx(`magic-used:${payload.jti}`, "1", (TTL_MIN + 1) * 60_000))) return null;
    return payload.email.toLowerCase();
  } catch { return null; }
}

export async function sendMagicLink(emailRaw: string) {
  if (!emailLoginEnabled()) throw new AppError(404, "disabled", "ยังไม่เปิดใช้การเข้าสู่ระบบด้วยอีเมล");
  const email = emailRaw.trim().toLowerCase();
  if (!(await kv().setNx(`magic-rate:${email}`, "1", 60_000))) throw new AppError(429, "rate_limited", "ขอลิงก์ถี่เกินไป กรุณารอ 1 นาที");
  const token = await issueMagicToken(email);
  const url = `${env.baseUrl}/login/verify?token=${encodeURIComponent(token)}`;
  const tx = nodemailer.createTransport(env.smtpUrl);
  await tx.sendMail({
    from: env.smtpFrom, to: email, subject: "ลิงก์เข้าสู่ระบบ — ระบบติดตามสถานการณ์น้ำ",
    text: `คลิกเพื่อเข้าสู่ระบบ (ใช้ได้ครั้งเดียว ภายใน ${TTL_MIN} นาที):\n${url}\n\nหากไม่ได้ร้องขอ กรุณาเพิกเฉย`,
  });
  log(`magic link sent to ${email}`);
}

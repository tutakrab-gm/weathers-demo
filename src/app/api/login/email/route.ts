import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/server/http";
import { findUserByIdentity, reportUnknownLogin } from "@/lib/services/users";
import { sendMagicLink } from "@/lib/services/magic";

export const runtime = "nodejs";

/** ตอบเหมือนกันเสมอ ไม่เปิดเผยว่าอีเมลนั้นลงทะเบียนหรือไม่ */
export async function POST(req: Request) {
  try {
    const { email } = z.object({ email: z.email() }).parse(await req.json().catch(() => ({})));
    const u = await findUserByIdentity({ email });
    if (u && u.status === "active") await sendMagicLink(email);
    else if (!u) await reportUnknownLogin("email", { email });
    return NextResponse.json({ ok: true, message: "หากอีเมลนี้ลงทะเบียนไว้ ระบบได้ส่งลิงก์เข้าสู่ระบบให้แล้ว" });
  } catch (e) { return errorResponse(e); }
}

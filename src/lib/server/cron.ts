import { timingSafeEqual } from "node:crypto";
import { env } from "../core/env";
import { AppError } from "../core/errors";
import { errorResponse } from "./http";
import { NextResponse } from "next/server";

function ok(req: Request) {
  if (!env.cronSecret) return false; // ไม่ตั้ง CRON_SECRET = ปิด endpoint
  const h = req.headers.get("authorization") ?? "";
  const a = Buffer.from(h), b = Buffer.from(`Bearer ${env.cronSecret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function cron(fn: () => Promise<unknown>) {
  return async (req: Request) => {
    try {
      if (!ok(req)) throw new AppError(401, "unauthorized", "invalid cron secret");
      return NextResponse.json(await fn());
    } catch (e) { return errorResponse(e); }
  };
}

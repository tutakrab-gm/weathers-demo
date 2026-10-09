import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ConflictError } from "../core/errors";
import { requireActor } from "./session";
import type { Actor } from "../services/access";
import type { User } from "../repo/types";

type Ctx<P> = { params: Promise<P> };

/** ห่อ route handler: auth + แปลง error เป็น JSON (zod -> 400, Conflict -> 409 พร้อม current) */
export function route<P = Record<string, string>>(
  fn: (req: Request, c: { actor: Actor; user: User; params: P }) => Promise<Response | unknown>,
  opts: { auth?: boolean } = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const params = (await ctx?.params) ?? ({} as P);
      const a = opts.auth === false ? ({} as { actor: Actor; user: User }) : await requireActor();
      const out = await fn(req, { ...a, params });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ConflictError) return NextResponse.json({ error: "conflict", message: e.message, current: e.current }, { status: 409 });
  if (e instanceof AppError) return NextResponse.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: "validation", message: e.issues.map((i) => `${i.path.join(".") || "ข้อมูล"}: ${i.message}`).join("; "), issues: e.issues }, { status: 400 });
  }
  console.error("[api] unhandled", e);
  return NextResponse.json({ error: "internal", message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
}

export const json = async <T>(req: Request): Promise<T> => {
  try { return (await req.json()) as T; } catch { throw new AppError(400, "bad_json", "รูปแบบข้อมูลไม่ถูกต้อง"); }
};

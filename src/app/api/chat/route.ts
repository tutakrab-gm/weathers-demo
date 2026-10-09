import { z } from "zod";
import { errorResponse } from "@/lib/server/http";
import { requireActor } from "@/lib/server/session";
import { chat } from "@/lib/services/chat";
import { kv } from "@/lib/core/kv";
import { AppError } from "@/lib/core/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

/** SSE: data: {type:"text"|"tool"|"done"|"error"} */
export async function POST(req: Request) {
  try {
    const { actor } = await requireActor();
    const { messages } = body.parse(await req.json().catch(() => ({})));
    if (messages[messages.length - 1].role !== "user") throw new AppError(400, "bad_request", "ข้อความสุดท้ายต้องเป็นของผู้ใช้");
    const k = `chat-rate:${actor.user_id}:${Math.floor(Date.now() / 60_000)}`;
    const n = Number((await kv().get(k)) ?? 0) + 1;
    await kv().set(k, String(n), 70_000);
    if (n > 15) throw new AppError(429, "rate_limited", "ถามถี่เกินไป กรุณารอสักครู่");
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(c) {
        for await (const ev of chat(actor, messages.slice(-20))) c.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        c.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
  } catch (e) { return errorResponse(e); }
}

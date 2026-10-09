import { route } from "@/lib/server/http";
import { heartbeat, release } from "@/lib/services/presence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = route<{ id: string }>(async (_r, { actor, params }) => ({ editors: await heartbeat(actor, params.id) }));
export const DELETE = route<{ id: string }>(async (_r, { actor, params }) => { await release(actor, params.id); return { ok: true }; });

import { route } from "@/lib/server/http";
import { projectDetail } from "@/lib/services/overview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route<{ id: string }>(async (_r, { actor, params }) => projectDetail(actor, params.id));

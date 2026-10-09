import { route } from "@/lib/server/http";
import { overview } from "@/lib/services/overview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async (_r, { actor }) => overview(actor));

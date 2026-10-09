import { listExternalStations } from "@/lib/adapters/water";
import { route } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async () => listExternalStations());

import { cron } from "@/lib/server/cron";
import { refreshExternal } from "@/lib/services/jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const h = cron(refreshExternal);
export { h as GET, h as POST };

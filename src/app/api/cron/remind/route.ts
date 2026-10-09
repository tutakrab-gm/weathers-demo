import { cron } from "@/lib/server/cron";
import { remindOverdue } from "@/lib/services/jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const h = cron(remindOverdue);
export { h as GET, h as POST };

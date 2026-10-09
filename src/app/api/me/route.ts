import { route } from "@/lib/server/http";
import { accessMap } from "@/lib/services/access";
export const runtime = "nodejs";
export const GET = route(async (_r, { user, actor }) => ({
  user: { user_id: user.user_id, display_name: user.display_name, role: user.role, email: user.email },
  access: Object.fromEntries(await accessMap(actor)),
}));

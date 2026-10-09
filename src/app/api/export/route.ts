import { z } from "zod";
import { route } from "@/lib/server/http";
import { exportPdf, exportXlsx } from "@/lib/services/export";
import { audit } from "@/lib/services/audit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const q = z.object({
  format: z.enum(["xlsx", "pdf"]).default("xlsx"),
  project: z.string().optional(),
  from: z.string().optional(), to: z.string().optional(),
});
const iso = (s?: string, end = false) => (s ? new Date(`${s}T${end ? "23:59:59" : "00:00:00"}+07:00`).toISOString() : undefined);

export const GET = route(async (req, { actor }) => {
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const opts = { projectIds: p.project ? p.project.split(",") : undefined, from: iso(p.from), to: iso(p.to, true) };
  const buf = p.format === "pdf" ? await exportPdf(actor, opts) : await exportXlsx(actor, opts);
  await audit(actor.user_id, "export", "report", p.format, "", opts);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": p.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="water-report-${stamp}.${p.format}"`,
      "cache-control": "private, no-store",
    },
  });
});

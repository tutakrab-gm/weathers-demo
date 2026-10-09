import { NextResponse } from "next/server";
import { json, route } from "@/lib/server/http";
import { createReport, listReports } from "@/lib/services/reports";
import { reportInput } from "@/lib/services/schemas";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (req, { actor, params }) => {
  const u = new URL(req.url);
  return listReports(actor, params.id, { includeVoid: u.searchParams.get("void") === "1", limit: Number(u.searchParams.get("limit") || 100), from: u.searchParams.get("from") || undefined, to: u.searchParams.get("to") || undefined });
});
export const POST = route<{ id: string }>(async (req, { actor, params }) => {
  const input = reportInput.parse(await json(req));
  return NextResponse.json(await createReport(actor, params.id, input), { status: 201 });
});

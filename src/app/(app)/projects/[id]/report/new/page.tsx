import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/core/errors";
import { getSession } from "@/lib/server/session";
import { assertProjectAccess } from "@/lib/services/access";
import { ReportForm } from "@/components/ReportForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "รายงานสถานการณ์" };

export default async function NewReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (s.state !== "active") return null;
  try {
    const p = await assertProjectAccess(s.actor, id, "edit");
    return <ReportForm projectId={id} projectName={p.name} gaugePoint={p.gauge_point} thresholds={{ threshold_watch_cm: p.threshold_watch_cm, threshold_warning_cm: p.threshold_warning_cm, threshold_critical_cm: p.threshold_critical_cm }} />;
  } catch (e) {
    if (e instanceof AppError && e.status === 403) redirect(`/projects/${id}`);
    if (e instanceof AppError) notFound();
    throw e;
  }
}

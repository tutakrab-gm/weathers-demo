import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/core/errors";
import { getSession } from "@/lib/server/session";
import { assertProjectAccess } from "@/lib/services/access";
import { listPhotos } from "@/lib/services/photos";
import { reportHistory } from "@/lib/services/reports";
import { ReportForm } from "@/components/ReportForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "แก้ไขรายงาน" };

export default async function EditReport({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const s = await getSession();
  if (s.state !== "active") return null;
  try {
    const p = await assertProjectAccess(s.actor, id, "edit");
    const hist = await reportHistory(s.actor, id, rid);
    const latest = hist[hist.length - 1];
    if (!latest) notFound();
    if (latest.status === "void") redirect(`/projects/${id}`);
    const photos = (await listPhotos(s.actor, id, rid)).map((x) => x.photo_id);
    return <ReportForm projectId={id} projectName={p.name} gaugePoint={p.gauge_point} existing={latest} existingPhotos={photos} thresholds={{ threshold_watch_cm: p.threshold_watch_cm, threshold_warning_cm: p.threshold_warning_cm, threshold_critical_cm: p.threshold_critical_cm }} />;
  } catch (e) {
    if (e instanceof AppError && e.status === 403) redirect(`/projects/${id}`);
    if (e instanceof AppError) notFound();
    throw e;
  }
}

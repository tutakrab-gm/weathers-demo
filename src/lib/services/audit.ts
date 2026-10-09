import { newId } from "../core/ids";
import { nowIso } from "../core/time";
import { repoReady } from "../repo";

export async function audit(userId: string, action: string, entity: string, entityId: string, projectId = "", detail: unknown = null, ip = "") {
  try {
    const repo = await repoReady();
    await repo.insert("audit", {
      log_id: newId("log"), at: nowIso(), user_id: userId, action, entity, entity_id: entityId, project_id: projectId,
      detail: detail ? JSON.stringify(detail).slice(0, 4000) : "", ip,
    }, userId);
  } catch (e) {
    console.error("[audit] failed", e); // audit ล้มเหลวต้องไม่ทำให้ธุรกรรมหลักล้ม
  }
}

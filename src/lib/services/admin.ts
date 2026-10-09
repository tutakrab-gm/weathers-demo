import { AppError, ConflictError, notFound } from "../core/errors";
import { newId } from "../core/ids";
import { kv } from "../core/kv";
import { repoReady } from "../repo";
import { rowKey, type Row, type TableName } from "../repo/schema";
import { assertAdmin, type Actor } from "./access";
import { audit } from "./audit";
import { adminSchemas, type AdminTable } from "./schemas";
import { recomputeStatus } from "./reports";
import { invalidateUser } from "./users";

const tableOf: Record<AdminTable, TableName> = { users: "users", access: "access", projects: "projects", stations: "stations" };
const idCol: Record<AdminTable, string> = { users: "user_id", access: "id", projects: "project_id", stations: "link_id" };
const idPrefix: Record<AdminTable, string> = { users: "u", access: "acc", projects: "prj", stations: "stn" };

export async function adminList(actor: Actor, t: AdminTable) {
  assertAdmin(actor);
  return (await repoReady()).list(tableOf[t], { fresh: true });
}

export async function adminCreate(actor: Actor, t: AdminTable, body: unknown) {
  assertAdmin(actor);
  const data = adminSchemas[t].parse(body) as Record<string, unknown>;
  const table = tableOf[t];
  const repo = await repoReady();
  return kv().withLock(`table:${table}`, async () => {
    const id = (data[idCol[t]] as string | undefined) || newId(idPrefix[t]);
    if (t === "users") {
      const email = String(data.email || ""), line = String(data.line_user_id || "");
      for (const u of await repo.list("users", { fresh: true })) {
        if ((email && u.email.toLowerCase() === email) || (line && u.line_user_id === line)) throw new AppError(409, "duplicate", "มีผู้ใช้ที่ใช้อีเมล/LINE ID นี้อยู่แล้ว");
      }
      data.created_at = new Date().toISOString();
    }
    if (t === "access") {
      const rows = await repo.list("access", { fresh: true });
      if (rows.some((a) => a.user_id === data.user_id && a.project_id === data.project_id && (!a.valid_to || a.valid_to >= String(data.valid_from || "")))) {
        // อนุญาตซ้ำได้ถ้าช่วงเวลาไม่ทับกัน — เพื่อความง่าย ห้ามซ้ำคู่ user/project ที่ยังไม่หมดอายุ ให้แก้แถวเดิม
        throw new AppError(409, "duplicate", "ผู้ใช้นี้มีสิทธิ์ในโครงการนี้อยู่แล้ว ให้แก้ไขแถวเดิม");
      }
    }
    const row = await repo.insert(table, { ...data, [idCol[t]]: id } as never, actor.user_id);
    if (t === "projects") await recomputeStatus(id, actor.user_id);
    await audit(actor.user_id, `${t}.create`, t, id, t === "projects" ? id : String(data.project_id ?? ""), data);
    return row;
  });
}

/** update ด้วย optimistic lock: ต้องส่ง version ที่อ่านมา; ไม่ตรง => ConflictError (409) พร้อมแถวล่าสุด */
export async function adminUpdate(actor: Actor, t: AdminTable, id: string, version: number, body: unknown) {
  assertAdmin(actor);
  const data = adminSchemas[t].parse(body) as Record<string, unknown>;
  delete data[idCol[t]];
  const table = tableOf[t];
  const repo = await repoReady();
  return kv().withLock(`table:${table}`, async () => {
    const cur = await repo.get(table, id, { fresh: true });
    if (!cur) throw notFound();
    if (t === "users" && id === actor.user_id && (data.status !== "active" || data.role !== "admin")) {
      if (cur.version === version) throw new AppError(400, "self_lockout", "ไม่สามารถลดสิทธิ์/ปิดบัญชีของตัวเองได้");
    }
    const row = await repo.update(table, id, version, data as never, actor.user_id);
    if (t === "users") invalidateUser(id);
    await audit(actor.user_id, `${t}.update`, t, id, t === "projects" ? id : String((row as Row).project_id ?? ""), data);
    return row;
  });
}

export async function adminRemove(actor: Actor, t: AdminTable, id: string, version: number) {
  assertAdmin(actor);
  const table = tableOf[t];
  const repo = await repoReady();
  return kv().withLock(`table:${table}`, async () => {
    const cur = await repo.get(table, id, { fresh: true });
    if (!cur) throw notFound();
    if (Number(cur.version) !== Number(version)) throw new ConflictError({ ...cur });
    if (t === "users") {
      if (id === actor.user_id) throw new AppError(400, "self_lockout", "ไม่สามารถปิดบัญชีของตัวเองได้");
      await repo.update("users", id, version, { status: "disabled" }, actor.user_id); // soft delete เพื่อรักษา audit trail
      invalidateUser(id);
    } else if (t === "projects") {
      await repo.update("projects", id, version, { status: "archived" }, actor.user_id);
    } else await repo.remove(table, rowKey(table, cur));
    await audit(actor.user_id, `${t}.remove`, t, id);
  });
}

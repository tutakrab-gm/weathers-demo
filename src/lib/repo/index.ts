import path from "node:path";
import { modes } from "../core/env";
import { warnOnce } from "../core/logger";
import { MockRepository } from "./mock";
import type { Repository } from "./types";

const g = globalThis as unknown as { __repo?: Repository; __repoReady?: Promise<void> };

/** คืน repository ตามโหมด; mock จะ seed อัตโนมัติเมื่อว่าง */
export function repo(): Repository {
  if (g.__repo) return g.__repo;
  if (modes.sheets === "real") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleSheetsRepository } = require("./sheets") as typeof import("./sheets");
    g.__repo = new GoogleSheetsRepository();
  } else {
    warnOnce("repo", "ไม่มี SHEET_ID/GOOGLE_SERVICE_ACCOUNT_JSON: ใช้ MockRepository (ข้อมูลเก็บที่ .data/mock-db.json)");
    const persist = process.env.MOCK_PERSIST !== "0";
    g.__repo = new MockRepository({ file: persist ? path.join(process.cwd(), ".data", "mock-db.json") : undefined });
  }
  return g.__repo;
}

/** รอให้ mock seed เสร็จก่อนใช้งาน (เรียกใน requireUser / route handler) */
export async function repoReady(): Promise<Repository> {
  const r = repo();
  if (r.mode === "mock" && (r as MockRepository).isEmpty) {
    g.__repoReady ??= import("../services/seed").then((m) => m.seedAll(r)).then(() => undefined);
    await g.__repoReady;
  }
  return r;
}

export function __setRepo(r: Repository | undefined) { g.__repo = r; g.__repoReady = undefined; }

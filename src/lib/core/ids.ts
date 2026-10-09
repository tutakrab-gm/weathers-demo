import { randomBytes, randomUUID } from "node:crypto";
export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const randomToken = (n = 24) => randomBytes(n).toString("base64url");

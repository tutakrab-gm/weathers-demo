import type { Actor } from "./access";
/** seed เรียกผ่าน actor admin ของระบบ (admin เข้าถึงทุกโครงการอยู่แล้ว) */
export async function __withBypass<T>(actor: Actor, fn: (a: Actor) => Promise<T>) { return fn(actor); }
